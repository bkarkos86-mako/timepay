import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { endOfDayUTC } from '../lib/dateRange.js';

export const leaveRouter = Router();
leaveRouter.use(requireAuth);

const HOURS_PER_DAY = 8;

function daysInRange(start, end) {
  const days = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ---------- Leave types (configurable list) ----------

leaveRouter.get('/types', async (req, res) => {
  res.json(await prisma.leaveType.findMany({ orderBy: { name: 'asc' } }));
});

leaveRouter.post('/types', requireRole('ADMIN'), async (req, res) => {
  const { name, accrualPerMonth = 0, maxBalance, requiresApproval = true } = req.body;
  const type = await prisma.leaveType.create({ data: { name, accrualPerMonth, maxBalance, requiresApproval } });
  res.status(201).json(type);
});

// ---------- Balances ----------

leaveRouter.get('/balances', async (req, res) => {
  const { employeeId } = req.query;
  const targetId = employeeId || req.user.sub;
  if (targetId !== req.user.sub && !['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const balances = await prisma.leaveBalance.findMany({ where: { employeeId: targetId }, include: { leaveType: true } });
  res.json(balances);
});

// Monthly accrual: adds each leave type's accrualPerMonth to every active
// employee's balance, capped at maxBalance. Safe to call repeatedly — skips
// employees already accrued for the current calendar month.
leaveRouter.post('/accrue', requireRole('ADMIN'), async (req, res) => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

  const [employees, leaveTypes] = await Promise.all([
    prisma.employee.findMany({ where: { employmentStatus: 'ACTIVE' } }),
    prisma.leaveType.findMany(),
  ]);

  let accrualCount = 0;
  for (const emp of employees) {
    for (const lt of leaveTypes) {
      if (lt.accrualPerMonth <= 0) continue;
      const existing = await prisma.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId: { employeeId: emp.id, leaveTypeId: lt.id } },
      });
      const lastKey = existing?.lastAccrualDate
        ? `${new Date(existing.lastAccrualDate).getFullYear()}-${new Date(existing.lastAccrualDate).getMonth()}`
        : null;
      if (lastKey === monthKey) continue; // already accrued this month

      const currentBalance = existing?.balanceHours ?? 0;
      const newBalance = lt.maxBalance != null ? Math.min(currentBalance + lt.accrualPerMonth, lt.maxBalance) : currentBalance + lt.accrualPerMonth;

      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId: { employeeId: emp.id, leaveTypeId: lt.id } },
        update: { balanceHours: newBalance, lastAccrualDate: now },
        create: { employeeId: emp.id, leaveTypeId: lt.id, balanceHours: lt.accrualPerMonth, lastAccrualDate: now },
      });
      accrualCount++;
    }
  }

  res.json({ accrualCount });
});

// ---------- Requests ----------

leaveRouter.post('/requests', async (req, res) => {
  const employeeId = req.user.sub;
  const { leaveTypeId, startDate, endDate, reason } = req.body;
  if (!leaveTypeId || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'leaveTypeId, startDate, endDate, and reason are required' });
  }

  const days = daysInRange(startDate, endDate);
  const hoursTotal = days.length * HOURS_PER_DAY;

  const request = await prisma.leaveRequest.create({
    data: { employeeId, leaveTypeId, startDate: new Date(startDate), endDate: new Date(endDate), hoursTotal, reason },
  });

  // Staffing check is advisory: flag in the response, don't block submission.
  let staffingWarning = null;
  const rules = await prisma.staffingRule.findMany();
  if (rules.length > 0) {
    const overlapping = await prisma.leaveRequest.count({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        id: { not: request.id },
        startDate: { lte: new Date(endDate) },
        endDate: { gte: new Date(startDate) },
      },
    });
    const tightestRule = rules.reduce((min, r) => Math.min(min, r.maxConcurrentLeave), Infinity);
    if (overlapping + 1 > tightestRule) {
      staffingWarning = `${overlapping + 1} employees now have overlapping leave requests in this window (limit: ${tightestRule}).`;
    }
  }

  res.status(201).json({ ...request, staffingWarning });
});

leaveRouter.get('/requests', async (req, res) => {
  const { employeeId, status } = req.query;
  const isManager = ['ADMIN', 'MANAGER'].includes(req.user.systemRole);
  const where = {};
  if (isManager && employeeId) where.employeeId = employeeId;
  if (!isManager) where.employeeId = req.user.sub;
  if (status) where.status = status;

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: { leaveType: true, employee: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
});

// Approved leave across the team, for the calendar view.
leaveRouter.get('/calendar', async (req, res) => {
  const { from, to } = req.query;
  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      startDate: { lte: to ? endOfDayUTC(to) : undefined },
      endDate: { gte: from ? new Date(from) : undefined },
    },
    include: { leaveType: true, employee: { select: { firstName: true, lastName: true } } },
  });
  res.json(requests);
});

leaveRouter.post('/requests/:id/approve', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request already decided' });

  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId } },
  });
  const balanceBefore = balance?.balanceHours ?? 0;
  const balanceAfter = balanceBefore - request.hoursTotal;

  const [updated] = await prisma.$transaction([
    prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', approverId: req.user.sub, decidedAt: new Date() },
    }),
    prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId } },
      update: { balanceHours: balanceAfter },
      create: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, balanceHours: -request.hoursTotal },
    }),
  ]);

  await logAudit({
    entityType: 'LeaveRequest',
    entityId: request.id,
    changedById: req.user.sub,
    changeDescription: 'Approved leave request; balance deducted',
    oldValue: { status: 'PENDING', balanceHours: balanceBefore },
    newValue: { status: 'APPROVED', balanceHours: balanceAfter },
  });

  res.json(updated);
});

leaveRouter.post('/requests/:id/deny', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { decisionNote } = req.body;
  const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request already decided' });

  const updated = await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status: 'DENIED', approverId: req.user.sub, decidedAt: new Date(), decisionNote },
  });

  await logAudit({
    entityType: 'LeaveRequest',
    entityId: request.id,
    changedById: req.user.sub,
    changeDescription: 'Denied leave request',
    reason: decisionNote,
  });

  res.json(updated);
});

// ---------- Staffing rules (admin) ----------

leaveRouter.get('/staffing-rules', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  res.json(await prisma.staffingRule.findMany());
});

leaveRouter.post('/staffing-rules', requireRole('ADMIN'), async (req, res) => {
  const { name, maxConcurrentLeave, blackoutStart, blackoutEnd } = req.body;
  const rule = await prisma.staffingRule.create({
    data: {
      name,
      maxConcurrentLeave,
      blackoutStart: blackoutStart ? new Date(blackoutStart) : null,
      blackoutEnd: blackoutEnd ? new Date(blackoutEnd) : null,
    },
  });
  res.status(201).json(rule);
});
