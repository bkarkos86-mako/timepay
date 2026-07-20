import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { computeWageBreakdown, compute13thMonthAccrual } from '../lib/wageCalc.js';
import { computeAllContributions } from '../lib/govContributions.js';
import { endOfDayUTC } from '../lib/dateRange.js';

export const payrollRouter = Router();
payrollRouter.use(requireAuth);

async function getConfig() {
  return prisma.payRuleConfig.upsert({ where: { id: 'default' }, update: {}, create: {} });
}

function dayKey(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

// Fetch approved, clocked-out entries for one employee in [from, to], enriched
// with the resolved hourly rate, holiday info, and rest-day flag needed by
// computeWageBreakdown.
async function loadEnrichedEntries(employeeId, from, to) {
  const [employee, entries, holidays] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, include: { jobRoles: true } }),
    prisma.timeEntry.findMany({
      where: { employeeId, status: 'APPROVED', clockOut: { not: null }, clockIn: { gte: new Date(from), lte: endOfDayUTC(to) } },
      include: { breaks: true, shift: true },
    }),
    prisma.holiday.findMany({ where: { date: { gte: new Date(from), lte: endOfDayUTC(to) } } }),
  ]);

  if (!employee) return null;

  const rateByRole = new Map(employee.jobRoles.map((r) => [r.roleName, r.hourlyRate]));
  const allowanceByRole = new Map(employee.jobRoles.map((r) => [r.roleName, r.dailyAllowance]));
  const holidayByDay = new Map(holidays.map((h) => [dayKey(h.date), h]));

  const enriched = entries.map((e) => ({
    ...e,
    hourlyRate: rateByRole.get(e.roleName) ?? 0,
    dailyAllowance: allowanceByRole.get(e.roleName) ?? 0,
    holiday: holidayByDay.get(dayKey(e.clockIn)) ?? null,
  }));

  return enriched;
}

payrollRouter.get('/summary', async (req, res) => {
  const { employeeId, from, to } = req.query;
  const targetId = employeeId || req.user.sub;
  if (targetId !== req.user.sub && !['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const entries = await loadEnrichedEntries(targetId, from, to);
  if (!entries) return res.status(404).json({ error: 'Employee not found' });

  const config = await getConfig();
  const breakdown = computeWageBreakdown(entries, config);
  res.json(breakdown);
});

payrollRouter.get('/13th-month', async (req, res) => {
  const { employeeId, year } = req.query;
  const targetId = employeeId || req.user.sub;
  if (targetId !== req.user.sub && !['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const y = Number(year) || new Date().getFullYear();
  const config = await getConfig();

  const monthlyBreakdowns = [];
  for (let m = 0; m < 12; m++) {
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0, 23, 59, 59);
    if (from > new Date()) break;
    const entries = await loadEnrichedEntries(targetId, from, to);
    monthlyBreakdowns.push(computeWageBreakdown(entries ?? [], config));
  }

  const accrued = compute13thMonthAccrual(monthlyBreakdowns);
  res.json({ year: y, accrued, monthsCounted: monthlyBreakdowns.length });
});

payrollRouter.get('/contributions', async (req, res) => {
  const { monthlySalary } = req.query;
  if (!monthlySalary) return res.status(400).json({ error: 'monthlySalary is required' });
  const brackets = await prisma.govContributionBracket.findMany();
  res.json(computeAllContributions(brackets, Number(monthlySalary)));
});

// ---------- Config, holidays, brackets (admin-managed reference data) ----------

// Read-only for any authenticated employee (self-service dashboard needs to
// know the current period); mutation stays admin-only under /api/admin.
payrollRouter.get('/pay-periods', async (req, res) => {
  res.json(await prisma.payPeriod.findMany({ orderBy: { startDate: 'desc' } }));
});

payrollRouter.get('/config', async (req, res) => res.json(await getConfig()));

payrollRouter.patch('/config', requireRole('ADMIN'), async (req, res) => {
  const updated = await prisma.payRuleConfig.update({ where: { id: 'default' }, data: req.body });
  res.json(updated);
});

payrollRouter.get('/holidays', async (req, res) => {
  res.json(await prisma.holiday.findMany({ orderBy: { date: 'asc' } }));
});

payrollRouter.post('/holidays', requireRole('ADMIN'), async (req, res) => {
  const { date, name, type, multiplierOverride } = req.body;
  const holiday = await prisma.holiday.create({ data: { date: new Date(date), name, type, multiplierOverride } });
  res.status(201).json(holiday);
});

payrollRouter.get('/brackets', async (req, res) => {
  res.json(await prisma.govContributionBracket.findMany());
});

payrollRouter.post('/brackets', requireRole('ADMIN'), async (req, res) => {
  const { type, minSalary, maxSalary, employeeContribution, employerContribution } = req.body;
  const bracket = await prisma.govContributionBracket.create({
    data: { type, minSalary, maxSalary, employeeContribution, employerContribution },
  });
  res.status(201).json(bracket);
});
