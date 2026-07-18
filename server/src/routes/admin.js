import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { computeWageBreakdown } from '../lib/wageCalc.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

// ---------- Audit log ----------

adminRouter.get('/audit-log', async (req, res) => {
  const { entityType, entityId } = req.query;
  const where = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  const logs = await prisma.auditLog.findMany({
    where,
    include: { changedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });
  res.json(logs);
});

// ---------- Pay periods ----------

adminRouter.get('/pay-periods', async (req, res) => {
  res.json(await prisma.payPeriod.findMany({ orderBy: { startDate: 'desc' } }));
});

adminRouter.post('/pay-periods', requireRole('ADMIN'), async (req, res) => {
  const { startDate, endDate } = req.body;
  const period = await prisma.payPeriod.create({ data: { startDate: new Date(startDate), endDate: new Date(endDate) } });
  res.status(201).json(period);
});

adminRouter.post('/pay-periods/:id/close', requireRole('ADMIN'), async (req, res) => {
  const period = await prisma.payPeriod.update({ where: { id: req.params.id }, data: { status: 'CLOSED', closedAt: new Date() } });
  res.json(period);
});

adminRouter.post('/pay-periods/:id/export', requireRole('ADMIN'), async (req, res) => {
  const period = await prisma.payPeriod.update({ where: { id: req.params.id }, data: { status: 'EXPORTED', exportedAt: new Date() } });
  res.json(period);
});

// ---------- Dashboard summary ----------

adminRouter.get('/dashboard', async (req, res) => {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const [activeCount, lateToday, pendingTimeEntries, pendingLeave, outsideGeofenceToday, openIncidents] = await Promise.all([
    prisma.timeEntry.count({ where: { clockOut: null, status: { in: ['APPROVED', 'PENDING'] } } }),
    prisma.timeEntry.count({ where: { isLate: true, clockIn: { gte: todayStart } } }),
    prisma.timeEntry.count({ where: { status: 'PENDING' } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.timeEntry.count({
      where: { clockIn: { gte: todayStart }, OR: [{ clockInOutsideGeofence: true }, { clockOutOutsideGeofence: true }] },
    }),
    prisma.geofenceIncident.count({ where: { resolvedAt: null } }),
  ]);
  res.json({ activeCount, lateToday, pendingTimeEntries, pendingLeave, outsideGeofenceToday, openIncidents });
});

// ---------- Geofence incidents (left area while clocked in) ----------

adminRouter.get('/geofence-incidents', async (req, res) => {
  const incidents = await prisma.geofenceIncident.findMany({
    include: {
      employee: { select: { firstName: true, lastName: true } },
      resolvedBy: { select: { firstName: true, lastName: true } },
      timeEntry: { select: { roleName: true, clockIn: true } },
    },
    orderBy: { startedAt: 'desc' },
    take: 100,
  });
  res.json(incidents);
});

// ---------- Ping challenges (covert push-based location spot-checks) ----------

adminRouter.get('/ping-challenges', async (req, res) => {
  const challenges = await prisma.pingChallenge.findMany({
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { scheduledAt: 'desc' },
    take: 100,
  });
  res.json(challenges);
});

// ---------- Long-running open shifts (housekeeping, not an alarm) ----------
// Anyone still clocked in an unusually long time — almost always someone who
// forgot to clock out, or whose phone died. Deliberately calm framing,
// separate from the geofence/incident lists above.

const STALE_SHIFT_HOURS = 12;
const STALE_SHIFT_GRACE_AFTER_SCHEDULED_END_HOURS = 2;

adminRouter.get('/long-running-shifts', async (req, res) => {
  const openEntries = await prisma.timeEntry.findMany({
    where: { clockOut: null, status: { in: ['APPROVED', 'PENDING'] } },
    include: { employee: { select: { firstName: true, lastName: true } }, shift: true },
  });

  const now = Date.now();
  const stale = openEntries.filter((e) => {
    const hoursOpen = (now - new Date(e.clockIn).getTime()) / 3600000;
    if (hoursOpen >= STALE_SHIFT_HOURS) return true;
    if (e.shift) {
      const hoursPastScheduledEnd = (now - new Date(e.shift.scheduledEnd).getTime()) / 3600000;
      if (hoursPastScheduledEnd >= STALE_SHIFT_GRACE_AFTER_SCHEDULED_END_HOURS) return true;
    }
    return false;
  });

  res.json(stale);
});

// ---------- Flagged entries (late, undertime, or outside geofence) ----------

adminRouter.get('/flagged-entries', async (req, res) => {
  const days = Number(req.query.days) || 14;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const entries = await prisma.timeEntry.findMany({
    where: {
      type: 'CLOCK',
      clockIn: { gte: since },
      OR: [{ isLate: true }, { isUndertime: true }, { clockInOutsideGeofence: true }, { clockOutOutsideGeofence: true }],
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { clockIn: 'desc' },
    take: 100,
  });
  res.json(entries);
});

// ---------- CSV export ----------

function toCsvRow(fields) {
  return fields
    .map((f) => {
      const s = String(f ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

adminRouter.get('/export/csv', async (req, res) => {
  const { from, to, employeeId } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const employees = await prisma.employee.findMany({
    where: employeeId ? { id: employeeId } : {},
    include: { jobRoles: true },
  });
  const config = await prisma.payRuleConfig.upsert({ where: { id: 'default' }, update: {}, create: {} });
  const holidays = await prisma.holiday.findMany({ where: { date: { gte: new Date(from), lte: new Date(to) } } });
  const holidayByDay = new Map(holidays.map((h) => [new Date(h.date).setHours(0, 0, 0, 0), h]));

  const rows = [toCsvRow(['Employee', 'Role', 'Date', 'Regular Hrs', 'OT Hrs', 'Night Diff Hrs', 'Day Type', 'Rate', 'Pay'])];

  for (const emp of employees) {
    const entries = await prisma.timeEntry.findMany({
      where: { employeeId: emp.id, status: 'APPROVED', clockOut: { not: null }, clockIn: { gte: new Date(from), lte: new Date(to) } },
      include: { breaks: true, shift: true },
    });
    const rateByRole = new Map(emp.jobRoles.map((r) => [r.roleName, r.hourlyRate]));
    const enriched = entries.map((e) => ({
      ...e,
      hourlyRate: rateByRole.get(e.roleName) ?? 0,
      holiday: holidayByDay.get(new Date(e.clockIn).setHours(0, 0, 0, 0)) ?? null,
    }));
    const breakdown = computeWageBreakdown(enriched, config);
    for (const line of breakdown.lines) {
      rows.push(
        toCsvRow([
          `${emp.firstName} ${emp.lastName}`,
          line.roleName,
          new Date(line.date).toISOString().slice(0, 10),
          line.regularHours.toFixed(2),
          line.otHours.toFixed(2),
          line.nightDiffHours.toFixed(2),
          line.dayType,
          line.rate.toFixed(2),
          line.pay.toFixed(2),
        ])
      );
    }
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="payroll_${from}_${to}.csv"`);
  res.send(rows.join('\n'));
});
