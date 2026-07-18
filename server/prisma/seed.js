import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.employee.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      firstName: 'Ava',
      lastName: 'Admin',
      email: 'admin@example.com',
      passwordHash,
      systemRole: 'ADMIN',
      jobRoles: { create: [{ roleName: 'Administrator', hourlyRate: 0, isDefault: true }] },
    },
  });

  const manager = await prisma.employee.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      firstName: 'Mario',
      lastName: 'Manager',
      email: 'manager@example.com',
      passwordHash,
      systemRole: 'MANAGER',
      jobRoles: { create: [{ roleName: 'Shift Lead', hourlyRate: 80, isDefault: true }] },
    },
  });

  const employee = await prisma.employee.upsert({
    where: { email: 'employee@example.com' },
    update: {},
    create: {
      firstName: 'Ella',
      lastName: 'Employee',
      email: 'employee@example.com',
      passwordHash,
      systemRole: 'EMPLOYEE',
      jobRoles: {
        create: [
          { roleName: 'Cashier', hourlyRate: 62, isDefault: true },
          { roleName: 'Stock Clerk', hourlyRate: 58, isDefault: false },
        ],
      },
    },
  });

  const leaveTypes = ['Sick Leave', 'Vacation Leave', 'Emergency Leave'];
  for (const name of leaveTypes) {
    const lt = await prisma.leaveType.upsert({
      where: { name },
      update: {},
      create: { name, accrualPerMonth: name === 'Emergency Leave' ? 4 : 8, maxBalance: 120 },
    });
    for (const emp of [admin, manager, employee]) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId: { employeeId: emp.id, leaveTypeId: lt.id } },
        update: {},
        create: { employeeId: emp.id, leaveTypeId: lt.id, balanceHours: 40 },
      });
    }
  }

  await prisma.payRuleConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {},
  });

  console.log('Seeded:', { admin: admin.email, manager: manager.email, employee: employee.email });
  console.log('All accounts use password: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
