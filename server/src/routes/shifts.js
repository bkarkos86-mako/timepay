import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { endOfDayUTC } from '../lib/dateRange.js';

export const shiftsRouter = Router();
shiftsRouter.use(requireAuth);

shiftsRouter.get('/', async (req, res) => {
  const { employeeId, from, to } = req.query;
  const isManager = ['ADMIN', 'MANAGER'].includes(req.user.systemRole);
  const where = {};
  if (isManager && employeeId) where.employeeId = employeeId;
  if (!isManager) where.employeeId = req.user.sub;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = endOfDayUTC(to);
  }
  const shifts = await prisma.shift.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { date: 'asc' },
  });
  res.json(shifts);
});

shiftsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { employeeId, roleName, date, scheduledStart, scheduledEnd, breakMinutes = 0, isRestDay = false, notes } = req.body;
  if (!employeeId || !roleName || !date || !scheduledStart || !scheduledEnd) {
    return res.status(400).json({ error: 'employeeId, roleName, date, scheduledStart, scheduledEnd are required' });
  }
  const shift = await prisma.shift.create({
    data: {
      employeeId,
      roleName,
      date: new Date(date),
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      breakMinutes,
      isRestDay,
      notes,
    },
  });
  res.status(201).json(shift);
});

const MAX_BULK_SHIFTS = 1000;

// Creates many shifts in one call — e.g. the whole team's schedule for the
// next two weeks. Client computes the individual shift rows (which employee
// gets which role default, which dates match the selected weekdays); this
// just validates and bulk-inserts them.
shiftsRouter.post('/bulk', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { shifts } = req.body;
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({ error: 'shifts array is required' });
  }
  if (shifts.length > MAX_BULK_SHIFTS) {
    return res.status(400).json({ error: `Cannot create more than ${MAX_BULK_SHIFTS} shifts in one request` });
  }
  for (const s of shifts) {
    if (!s.employeeId || !s.roleName || !s.date || !s.scheduledStart || !s.scheduledEnd) {
      return res.status(400).json({ error: 'Each shift needs employeeId, roleName, date, scheduledStart, scheduledEnd' });
    }
  }

  const result = await prisma.shift.createMany({
    data: shifts.map((s) => ({
      employeeId: s.employeeId,
      roleName: s.roleName,
      date: new Date(s.date),
      scheduledStart: new Date(s.scheduledStart),
      scheduledEnd: new Date(s.scheduledEnd),
      breakMinutes: s.breakMinutes ?? 0,
      isRestDay: s.isRestDay ?? false,
      notes: s.notes,
    })),
  });

  res.status(201).json({ count: result.count });
});

shiftsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { scheduledStart, scheduledEnd, breakMinutes, isRestDay, notes } = req.body;
  const shift = await prisma.shift.update({
    where: { id: req.params.id },
    data: {
      scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
      breakMinutes,
      isRestDay,
      notes,
    },
  });
  res.json(shift);
});

shiftsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  await prisma.shift.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ---------- Shift change requests ----------
// An employee flags a date and explains what they need — this never
// auto-modifies the schedule, a manager reviews and adjusts the shift
// manually (or not) via the normal add/edit/delete tools, then resolves it.
// Mirrors the LeaveRequest approve/deny pattern.

shiftsRouter.post('/change-requests', async (req, res) => {
  const { date, shiftId, reason } = req.body;
  if (!date || !reason) {
    return res.status(400).json({ error: 'date and reason are required' });
  }
  const request = await prisma.shiftChangeRequest.create({
    data: { employeeId: req.user.sub, date: new Date(date), shiftId: shiftId || null, reason },
  });
  res.status(201).json(request);
});

shiftsRouter.get('/change-requests', async (req, res) => {
  const { employeeId, status } = req.query;
  const isManager = ['ADMIN', 'MANAGER'].includes(req.user.systemRole);
  const where = {};
  if (isManager && employeeId) where.employeeId = employeeId;
  if (!isManager) where.employeeId = req.user.sub;
  if (status) where.status = status;

  const requests = await prisma.shiftChangeRequest.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true } }, shift: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
});

shiftsRouter.post('/change-requests/:id/approve', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const request = await prisma.shiftChangeRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request already decided' });

  const updated = await prisma.shiftChangeRequest.update({
    where: { id: request.id },
    data: { status: 'APPROVED', approverId: req.user.sub, decidedAt: new Date() },
  });

  await logAudit({
    entityType: 'ShiftChangeRequest',
    entityId: request.id,
    changedById: req.user.sub,
    changeDescription: 'Approved shift change request',
  });

  res.json(updated);
});

shiftsRouter.post('/change-requests/:id/deny', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { decisionNote } = req.body;
  const request = await prisma.shiftChangeRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request already decided' });

  const updated = await prisma.shiftChangeRequest.update({
    where: { id: request.id },
    data: { status: 'DENIED', approverId: req.user.sub, decidedAt: new Date(), decisionNote },
  });

  await logAudit({
    entityType: 'ShiftChangeRequest',
    entityId: request.id,
    changedById: req.user.sub,
    changeDescription: 'Denied shift change request',
    reason: decisionNote,
  });

  res.json(updated);
});
