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
