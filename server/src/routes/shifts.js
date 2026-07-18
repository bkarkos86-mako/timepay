import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

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
    if (to) where.date.lte = new Date(to);
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
