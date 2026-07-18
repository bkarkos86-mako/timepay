import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadPhoto } from '../middleware/upload.js';
import { logAudit } from '../lib/audit.js';
import { checkGeofence, recordGeofenceCheck } from '../lib/geofenceIncidents.js';

export const timeEntriesRouter = Router();
timeEntriesRouter.use(requireAuth);

function photoUrl(file) {
  return file ? `/uploads/${file.filename}` : null;
}

// Find the employee's shift for the calendar day a timestamp falls on.
async function findShiftForDay(employeeId, timestamp) {
  const dayStart = new Date(timestamp);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return prisma.shift.findFirst({
    where: { employeeId, date: { gte: dayStart, lt: dayEnd } },
  });
}

const GRACE_MINUTES = 5;

// ---------- Clock in/out ----------

timeEntriesRouter.post('/clock-in', uploadPhoto.single('photo'), async (req, res) => {
  const employeeId = req.user.sub;
  const { lat, lng, roleName } = req.body;
  const now = new Date();

  const shift = await findShiftForDay(employeeId, now);
  const effectiveRole = roleName || shift?.roleName;
  if (!effectiveRole) {
    return res.status(400).json({ error: 'roleName is required when no shift is scheduled for today' });
  }

  let isLate = false;
  let lateMinutes = 0;
  if (shift) {
    const diffMin = Math.round((now - new Date(shift.scheduledStart)) / 60000);
    if (diffMin > GRACE_MINUTES) {
      isLate = true;
      lateMinutes = diffMin;
    }
  }

  const geofence = await checkGeofence(lat, lng);

  const entry = await prisma.timeEntry.create({
    data: {
      employeeId,
      shiftId: shift?.id ?? null,
      roleName: effectiveRole,
      type: 'CLOCK',
      status: 'APPROVED',
      clockIn: now,
      clockInPhotoUrl: photoUrl(req.file),
      clockInLat: lat ? Number(lat) : null,
      clockInLng: lng ? Number(lng) : null,
      isLate,
      lateMinutes,
      clockInDistanceMeters: geofence.distanceMeters,
      clockInOutsideGeofence: geofence.outsideGeofence,
    },
  });

  res.status(201).json(entry);
});

timeEntriesRouter.post('/:id/clock-out', uploadPhoto.single('photo'), async (req, res) => {
  const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.employeeId !== req.user.sub) return res.status(403).json({ error: 'Not your time entry' });
  if (entry.clockOut) return res.status(400).json({ error: 'Already clocked out' });

  const { lat, lng } = req.body;
  const now = new Date();

  let isUndertime = false;
  let undertimeMinutes = 0;
  if (entry.shiftId) {
    const shift = await prisma.shift.findUnique({ where: { id: entry.shiftId } });
    if (shift) {
      const diffMin = Math.round((new Date(shift.scheduledEnd) - now) / 60000);
      if (diffMin > GRACE_MINUTES) {
        isUndertime = true;
        undertimeMinutes = diffMin;
      }
    }
  }

  const geofence = await checkGeofence(lat, lng);

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      clockOut: now,
      clockOutPhotoUrl: photoUrl(req.file),
      clockOutLat: lat ? Number(lat) : null,
      clockOutLng: lng ? Number(lng) : null,
      isUndertime,
      undertimeMinutes,
      clockOutDistanceMeters: geofence.distanceMeters,
      clockOutOutsideGeofence: geofence.outsideGeofence,
    },
  });

  res.json(updated);
});

// ---------- Location pings & geofence incidents (while clocked in) ----------

// Called periodically by the employee's browser while clocked in and a
// worksite is configured. Never blocks — only logs and, on the first ping
// that lands outside every worksite, opens a GeofenceIncident and notifies
// both the employee and admins/managers via push.
timeEntriesRouter.post('/:id/location-ping', async (req, res) => {
  const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.employeeId !== req.user.sub) return res.status(403).json({ error: 'Not your time entry' });
  if (entry.clockOut) return res.status(400).json({ error: 'Already clocked out' });

  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });

  const geofence = await checkGeofence(lat, lng);

  await prisma.locationPing.create({
    data: {
      timeEntryId: entry.id,
      employeeId: entry.employeeId,
      lat: Number(lat),
      lng: Number(lng),
      distanceMeters: geofence.distanceMeters,
      outsideGeofence: geofence.outsideGeofence,
    },
  });

  const incident = await recordGeofenceCheck({
    timeEntryId: entry.id,
    employeeId: entry.employeeId,
    lat: Number(lat),
    lng: Number(lng),
    distanceMeters: geofence.distanceMeters,
    outsideGeofence: geofence.outsideGeofence,
  });

  res.status(201).json({ outsideGeofence: geofence.outsideGeofence, distanceMeters: geofence.distanceMeters, incident });
});

timeEntriesRouter.get('/:id/geofence-incidents/open', async (req, res) => {
  const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.employeeId !== req.user.sub && !['ADMIN', 'MANAGER'].includes(req.user.systemRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const incident = await prisma.geofenceIncident.findFirst({ where: { timeEntryId: entry.id, resolvedAt: null } });
  res.json(incident);
});

// Employee proves they're still on-site despite the geofence flag.
timeEntriesRouter.post('/:id/geofence-incidents/:incidentId/verify', uploadPhoto.single('photo'), async (req, res) => {
  const incident = await prisma.geofenceIncident.findUnique({ where: { id: req.params.incidentId } });
  if (!incident || incident.timeEntryId !== req.params.id) return res.status(404).json({ error: 'Not found' });
  if (incident.employeeId !== req.user.sub) return res.status(403).json({ error: 'Not your incident' });
  if (incident.resolvedAt) return res.status(400).json({ error: 'Already resolved' });

  const updated = await prisma.geofenceIncident.update({
    where: { id: incident.id },
    data: { resolvedAt: new Date(), resolution: 'PHOTO_VERIFIED', verificationPhotoUrl: photoUrl(req.file) },
  });

  await logAudit({
    entityType: 'GeofenceIncident',
    entityId: incident.id,
    changedById: req.user.sub,
    changeDescription: 'Employee submitted photo verification for geofence incident',
  });

  res.json(updated);
});

// Response to a covert push-based location spot-check (see PingChallenge in
// schema.prisma for why this exists instead of relying solely on the
// foreground ping loop). Silent on the client side by design — this just
// records where they were when they tapped the notification.
timeEntriesRouter.post('/:id/ping-challenges/:challengeId/respond', async (req, res) => {
  const challenge = await prisma.pingChallenge.findUnique({ where: { id: req.params.challengeId } });
  if (!challenge || challenge.timeEntryId !== req.params.id) return res.status(404).json({ error: 'Not found' });
  if (challenge.employeeId !== req.user.sub) return res.status(403).json({ error: 'Not your challenge' });
  if (challenge.status !== 'PENDING') return res.status(400).json({ error: 'Already responded to' });

  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });

  const geofence = await checkGeofence(lat, lng);

  const updated = await prisma.pingChallenge.update({
    where: { id: challenge.id },
    data: {
      respondedAt: new Date(),
      lat: Number(lat),
      lng: Number(lng),
      distanceMeters: geofence.distanceMeters,
      outsideGeofence: geofence.outsideGeofence,
      status: 'RESPONDED',
    },
  });

  await recordGeofenceCheck({
    timeEntryId: challenge.timeEntryId,
    employeeId: challenge.employeeId,
    lat: Number(lat),
    lng: Number(lng),
    distanceMeters: geofence.distanceMeters,
    outsideGeofence: geofence.outsideGeofence,
  });

  res.json(updated);
});

// Manager/admin ends the shift on the spot, e.g. after reviewing a geofence
// incident and deciding it was not legitimate.
timeEntriesRouter.post('/:id/force-clock-out', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.clockOut) return res.status(400).json({ error: 'Already clocked out' });

  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason is required' });

  const updated = await prisma.timeEntry.update({ where: { id: entry.id }, data: { clockOut: new Date() } });

  const openIncident = await prisma.geofenceIncident.findFirst({ where: { timeEntryId: entry.id, resolvedAt: null } });
  if (openIncident) {
    await prisma.geofenceIncident.update({
      where: { id: openIncident.id },
      data: { resolvedAt: new Date(), resolution: 'FORCED_CLOCK_OUT', resolvedById: req.user.sub },
    });
  }

  await logAudit({
    entityType: 'TimeEntry',
    entityId: entry.id,
    changedById: req.user.sub,
    changeDescription: 'Manager forced clock-out',
    reason,
  });

  res.json(updated);
});

// ---------- Breaks ----------

timeEntriesRouter.post('/:id/breaks/start', async (req, res) => {
  const entry = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.employeeId !== req.user.sub) return res.status(403).json({ error: 'Not your time entry' });

  const { type = 'BREAK' } = req.body;
  const brk = await prisma.breakEntry.create({
    data: { timeEntryId: entry.id, type, breakStart: new Date() },
  });
  res.status(201).json(brk);
});

timeEntriesRouter.post('/breaks/:breakId/end', async (req, res) => {
  const brk = await prisma.breakEntry.findUnique({ where: { id: req.params.breakId }, include: { timeEntry: true } });
  if (!brk) return res.status(404).json({ error: 'Not found' });
  if (brk.timeEntry.employeeId !== req.user.sub) return res.status(403).json({ error: 'Not your break' });
  if (brk.breakEnd) return res.status(400).json({ error: 'Break already ended' });

  const updated = await prisma.breakEntry.update({ where: { id: brk.id }, data: { breakEnd: new Date() } });
  res.json(updated);
});

// ---------- Manual entry (requires reason, goes to manager approval) ----------

timeEntriesRouter.post('/manual', async (req, res) => {
  const employeeId = req.user.sub;
  const { clockIn, clockOut, roleName, reason } = req.body;

  if (!clockIn || !roleName || !reason) {
    return res.status(400).json({ error: 'clockIn, roleName, and reason are required for manual entries' });
  }

  const entry = await prisma.timeEntry.create({
    data: {
      employeeId,
      roleName,
      type: 'MANUAL',
      status: 'PENDING',
      clockIn: new Date(clockIn),
      clockOut: clockOut ? new Date(clockOut) : null,
      reason,
    },
  });

  res.status(201).json(entry);
});

// ---------- Corrections (never overwrite; link new entry to the old one) ----------

timeEntriesRouter.post('/:id/correct', async (req, res) => {
  const original = await prisma.timeEntry.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ error: 'Not found' });

  const isOwner = original.employeeId === req.user.sub;
  const isManager = ['ADMIN', 'MANAGER'].includes(req.user.systemRole);
  if (!isOwner && !isManager) return res.status(403).json({ error: 'Insufficient permissions' });

  const { clockIn, clockOut, roleName, reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason is required for corrections' });

  const correction = await prisma.timeEntry.create({
    data: {
      employeeId: original.employeeId,
      roleName: roleName || original.roleName,
      type: 'MANUAL',
      status: isManager ? 'APPROVED' : 'PENDING',
      clockIn: clockIn ? new Date(clockIn) : original.clockIn,
      clockOut: clockOut ? new Date(clockOut) : original.clockOut,
      reason,
      correctionOfId: original.id,
    },
  });

  await logAudit({
    entityType: 'TimeEntry',
    entityId: original.id,
    changedById: req.user.sub,
    changeDescription: `Correction submitted (new entry ${correction.id})`,
    reason,
    oldValue: { clockIn: original.clockIn, clockOut: original.clockOut, roleName: original.roleName },
    newValue: { clockIn: correction.clockIn, clockOut: correction.clockOut, roleName: correction.roleName },
  });

  res.status(201).json(correction);
});

// ---------- Listing & approvals ----------

timeEntriesRouter.get('/', async (req, res) => {
  const { employeeId, from, to, status } = req.query;
  const isManager = ['ADMIN', 'MANAGER'].includes(req.user.systemRole);

  const where = {};
  if (isManager && employeeId) where.employeeId = employeeId;
  if (!isManager) where.employeeId = req.user.sub;
  if (status) where.status = status;
  if (from || to) {
    where.clockIn = {};
    if (from) where.clockIn.gte = new Date(from);
    if (to) where.clockIn.lte = new Date(to);
  }

  const entries = await prisma.timeEntry.findMany({
    where,
    include: { breaks: true, employee: { select: { firstName: true, lastName: true } } },
    orderBy: { clockIn: 'desc' },
  });
  res.json(entries);
});

timeEntriesRouter.get('/pending', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const entries = await prisma.timeEntry.findMany({
    where: { status: 'PENDING' },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(entries);
});

timeEntriesRouter.get('/active', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const entries = await prisma.timeEntry.findMany({
    where: { clockOut: null, status: { in: ['APPROVED', 'PENDING'] } },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { clockIn: 'asc' },
  });
  res.json(entries);
});

timeEntriesRouter.post('/:id/approve', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const entry = await prisma.timeEntry.update({
    where: { id: req.params.id },
    data: { status: 'APPROVED', approvedById: req.user.sub, approvedAt: new Date() },
  });

  await logAudit({
    entityType: 'TimeEntry',
    entityId: entry.id,
    changedById: req.user.sub,
    changeDescription: 'Approved',
  });

  res.json(entry);
});

timeEntriesRouter.post('/:id/reject', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { reason } = req.body;
  const entry = await prisma.timeEntry.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED', approvedById: req.user.sub, approvedAt: new Date() },
  });

  await logAudit({
    entityType: 'TimeEntry',
    entityId: entry.id,
    changedById: req.user.sub,
    changeDescription: 'Rejected',
    reason,
  });

  res.json(entry);
});
