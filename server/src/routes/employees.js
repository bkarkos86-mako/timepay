import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

const publicEmployee = (e) => ({
  id: e.id,
  firstName: e.firstName,
  lastName: e.lastName,
  email: e.email,
  systemRole: e.systemRole,
  employmentStatus: e.employmentStatus,
  hireDate: e.hireDate,
  regularizationDate: e.regularizationDate,
  jobRoles: e.jobRoles?.map((r) => ({ id: r.id, roleName: r.roleName, hourlyRate: r.hourlyRate, dailyAllowance: r.dailyAllowance, isDefault: r.isDefault })),
});

// Philippine Labor Code Art. 296: probationary employees become regular
// after 6 months of continuous service — used as the default suggestion,
// always overridable on the profile.
function defaultRegularizationDate(hireDate) {
  const d = new Date(hireDate);
  d.setMonth(d.getMonth() + 6);
  return d;
}

// Admin/manager: list all employees. Employees: only themselves.
employeesRouter.get('/', async (req, res) => {
  if (['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    const employees = await prisma.employee.findMany({ include: { jobRoles: true }, orderBy: { lastName: 'asc' } });
    return res.json(employees.map(publicEmployee));
  }
  const self = await prisma.employee.findUnique({ where: { id: req.user.sub }, include: { jobRoles: true } });
  res.json([publicEmployee(self)]);
});

employeesRouter.get('/:id', async (req, res) => {
  if (req.params.id !== req.user.sub && !['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const employee = await prisma.employee.findUnique({ where: { id: req.params.id }, include: { jobRoles: true } });
  if (!employee) return res.status(404).json({ error: 'Not found' });
  res.json(publicEmployee(employee));
});

employeesRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const { firstName, lastName, email, password, systemRole = 'EMPLOYEE', jobRoles = [], hireDate } = req.body;
  if (!firstName || !lastName || !email || !password || jobRoles.length === 0) {
    return res.status(400).json({ error: 'firstName, lastName, email, password, and at least one jobRole are required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const effectiveHireDate = hireDate ? new Date(hireDate) : new Date();
  const employee = await prisma.employee.create({
    data: {
      firstName,
      lastName,
      email,
      passwordHash,
      systemRole,
      hireDate: effectiveHireDate,
      regularizationDate: defaultRegularizationDate(effectiveHireDate),
      jobRoles: {
        create: jobRoles.map((r, i) => ({
          roleName: r.roleName,
          hourlyRate: r.hourlyRate,
          dailyAllowance: r.dailyAllowance ?? 0,
          isDefault: r.isDefault ?? i === 0,
        })),
      },
    },
    include: { jobRoles: true },
  });

  res.status(201).json(publicEmployee(employee));
});

employeesRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const { firstName, lastName, employmentStatus, systemRole, reason, hireDate, regularizationDate } = req.body;

  const before = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: 'Not found' });

  const statusChanging = employmentStatus && employmentStatus !== before.employmentStatus;
  if (statusChanging && employmentStatus !== 'ACTIVE' && !reason) {
    return res.status(400).json({ error: 'reason is required when removing/deactivating an employee' });
  }

  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: {
      firstName,
      lastName,
      employmentStatus,
      systemRole,
      hireDate: hireDate ? new Date(hireDate) : undefined,
      regularizationDate: regularizationDate ? new Date(regularizationDate) : undefined,
    },
    include: { jobRoles: true },
  });

  if (statusChanging) {
    // Offboarding shouldn't leave them clocked in forever — close out any open shift.
    if (employmentStatus !== 'ACTIVE') {
      await prisma.timeEntry.updateMany({
        where: { employeeId: employee.id, clockOut: null },
        data: { clockOut: new Date() },
      });
    }

    await logAudit({
      entityType: 'Employee',
      entityId: employee.id,
      changedById: req.user.sub,
      changeDescription: `Employment status changed: ${before.employmentStatus} → ${employmentStatus}`,
      reason,
      oldValue: { employmentStatus: before.employmentStatus },
      newValue: { employmentStatus },
    });
  }

  res.json(publicEmployee(employee));
});

// ---------- Job roles (per-role hourly rate & daily allowance) ----------

employeesRouter.patch('/:id/job-roles/:roleId', requireRole('ADMIN'), async (req, res) => {
  const { hourlyRate, dailyAllowance } = req.body;

  const role = await prisma.employeeJobRole.findUnique({ where: { id: req.params.roleId } });
  if (!role || role.employeeId !== req.params.id) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.employeeJobRole.update({
    where: { id: role.id },
    data: {
      hourlyRate: hourlyRate !== undefined && hourlyRate !== '' ? Number(hourlyRate) : undefined,
      dailyAllowance: dailyAllowance !== undefined && dailyAllowance !== '' ? Number(dailyAllowance) : undefined,
    },
  });

  await logAudit({
    entityType: 'EmployeeJobRole',
    entityId: role.id,
    changedById: req.user.sub,
    changeDescription: `Updated ${role.roleName} pay for employee ${role.employeeId}`,
    oldValue: { hourlyRate: role.hourlyRate, dailyAllowance: role.dailyAllowance },
    newValue: { hourlyRate: updated.hourlyRate, dailyAllowance: updated.dailyAllowance },
  });

  res.json(updated);
});

// ---------- Performance reviews ----------

employeesRouter.get('/:id/performance-reviews', async (req, res) => {
  if (req.params.id !== req.user.sub && !['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const reviews = await prisma.performanceReview.findMany({
    where: { employeeId: req.params.id },
    include: { reviewedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { reviewDate: 'desc' },
  });
  res.json(reviews);
});

employeesRouter.post('/:id/performance-reviews', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { rating, notes, reviewDate } = req.body;
  if (!rating || !notes) {
    return res.status(400).json({ error: 'rating and notes are required' });
  }
  const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!employee) return res.status(404).json({ error: 'Not found' });

  const review = await prisma.performanceReview.create({
    data: {
      employeeId: req.params.id,
      reviewedById: req.user.sub,
      rating,
      notes,
      reviewDate: reviewDate ? new Date(reviewDate) : new Date(),
    },
    include: { reviewedBy: { select: { firstName: true, lastName: true } } },
  });

  await logAudit({
    entityType: 'PerformanceReview',
    entityId: review.id,
    changedById: req.user.sub,
    changeDescription: `Performance review added: ${rating}`,
  });

  res.status(201).json(review);
});

// ---------- Tardiness (15+ min late clock-ins — tallied for reviews) ----------

employeesRouter.get('/:id/tardy-entries', async (req, res) => {
  if (req.params.id !== req.user.sub && !['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const where = { employeeId: req.params.id, isTardy: true };
  const [count, entries] = await Promise.all([
    prisma.timeEntry.count({ where }),
    prisma.timeEntry.findMany({ where, orderBy: { clockIn: 'desc' }, take: 50 }),
  ]);
  res.json({ count, entries });
});
