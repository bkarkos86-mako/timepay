import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

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
  jobRoles: e.jobRoles?.map((r) => ({ id: r.id, roleName: r.roleName, hourlyRate: r.hourlyRate, isDefault: r.isDefault })),
});

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
  const { firstName, lastName, email, password, systemRole = 'EMPLOYEE', jobRoles = [] } = req.body;
  if (!firstName || !lastName || !email || !password || jobRoles.length === 0) {
    return res.status(400).json({ error: 'firstName, lastName, email, password, and at least one jobRole are required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const employee = await prisma.employee.create({
    data: {
      firstName,
      lastName,
      email,
      passwordHash,
      systemRole,
      jobRoles: {
        create: jobRoles.map((r, i) => ({
          roleName: r.roleName,
          hourlyRate: r.hourlyRate,
          isDefault: r.isDefault ?? i === 0,
        })),
      },
    },
    include: { jobRoles: true },
  });

  res.status(201).json(publicEmployee(employee));
});

employeesRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const { firstName, lastName, employmentStatus, systemRole } = req.body;
  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data: { firstName, lastName, employmentStatus, systemRole },
    include: { jobRoles: true },
  });
  res.json(publicEmployee(employee));
});
