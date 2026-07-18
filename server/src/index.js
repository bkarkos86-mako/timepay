import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { authRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';
import { timeEntriesRouter } from './routes/timeEntries.js';
import { payrollRouter } from './routes/payroll.js';
import { leaveRouter } from './routes/leave.js';
import { shiftsRouter } from './routes/shifts.js';
import { adminRouter } from './routes/admin.js';
import { webauthnRouter } from './routes/webauthn.js';
import { worksitesRouter } from './routes/worksites.js';
import { pushRouter } from './routes/push.js';
import { startScheduler } from './lib/scheduler.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/leave', leaveRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth/webauthn', webauthnRouter);
app.use('/api/worksites', worksitesRouter);
app.use('/api/push', pushRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`timepay server listening on :${port}`));
startScheduler();
