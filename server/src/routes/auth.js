import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const employee = await prisma.employee.findUnique({ where: { email } });
  if (!employee) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, employee.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  if (employee.employmentStatus !== 'ACTIVE') {
    return res.status(403).json({ error: 'Account is not active' });
  }

  const token = jwt.sign(
    { sub: employee.id, systemRole: employee.systemRole, email: employee.email },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      systemRole: employee.systemRole,
    },
  });
});

// Creates the very first ADMIN account on a fresh database. There's no
// public signup — normally an admin creates every other account — so a
// brand-new deployment has no one who can log in yet to create that admin.
// Self-limiting: only works while the employees table is completely empty,
// so it's permanently inert the moment one account (this one) exists.
authRouter.post('/bootstrap-admin', async (req, res) => {
  const existing = await prisma.employee.count();
  if (existing > 0) {
    return res.status(403).json({ error: 'Setup already completed — an account already exists.' });
  }

  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'firstName, lastName, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.employee.create({
    data: {
      firstName,
      lastName,
      email,
      passwordHash,
      systemRole: 'ADMIN',
      regularizationDate: (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 6);
        return d;
      })(),
      jobRoles: { create: [{ roleName: 'Administrator', hourlyRate: 0, isDefault: true }] },
    },
  });

  res.status(201).json({ id: admin.id, email: admin.email });
});
