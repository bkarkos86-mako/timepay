import { prisma } from '../db.js';
import { sendPushToEmployee } from './push.js';

// Tuning knobs for the covert location spot-check. Kept as named constants
// (same pattern as GRACE_MINUTES in timeEntries.js) rather than a config UI —
// revisit if these need to be admin-adjustable later.
const SWEEP_INTERVAL_MS = 2 * 60 * 1000; // how often the server checks for due/newly-eligible challenges
const SHIFT_WINDOW_HOURS = 8; // the count below gets spread across this window from clock-in
const MIN_CHALLENGES_PER_SHIFT = 3;
const MAX_CHALLENGES_PER_SHIFT = 6; // randomized per shift so the count itself is unpredictable, not just the timing
const RESPONSE_DEADLINE_MINUTES = 10; // generous — this is a spot-check, not a test

// Generic, unremarkable copy — deliberately doesn't reveal this is a
// location check. See project notes: general disclosure that clocking in
// enables periodic location checks should live in an employee handbook/
// agreement, not in the notification text itself.
const CHALLENGE_TITLE = 'TimePay';
const CHALLENGE_BODY = 'Tap to open the app';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Called once per newly-eligible open shift: commits to a random count of
// check-ins for the whole shift up front, at random times across an 8hr
// window from clock-in, rather than rolling dice independently every sweep.
async function scheduleChallengesForEntry(entry) {
  const count = randomInt(MIN_CHALLENGES_PER_SHIFT, MAX_CHALLENGES_PER_SHIFT);
  const windowMs = SHIFT_WINDOW_HOURS * 60 * 60 * 1000;
  const clockInMs = new Date(entry.clockIn).getTime();

  const offsets = Array.from({ length: count }, () => Math.random() * windowMs);

  await prisma.pingChallenge.createMany({
    data: offsets.map((offset) => ({
      timeEntryId: entry.id,
      employeeId: entry.employeeId,
      scheduledAt: new Date(clockInMs + offset),
    })),
  });
}

// Picks up shifts that don't have a schedule yet — covers both the normal
// case (a worksite already existed at clock-in, so this fires within one
// sweep of it) and the edge case of a worksite being added mid-shift.
async function scheduleForNewlyEligibleShifts() {
  const activeWorksites = await prisma.worksite.count({ where: { isActive: true } });
  if (activeWorksites === 0) return; // geofencing (and this spot-check) is opt-in

  const openEntries = await prisma.timeEntry.findMany({
    where: { clockOut: null, status: { in: ['APPROVED', 'PENDING'] } },
  });

  for (const entry of openEntries) {
    const existing = await prisma.pingChallenge.count({ where: { timeEntryId: entry.id } });
    if (existing === 0) await scheduleChallengesForEntry(entry);
  }
}

async function dispatchDueChallenges() {
  const due = await prisma.pingChallenge.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
    include: { timeEntry: true },
  });

  for (const challenge of due) {
    if (challenge.timeEntry.clockOut) {
      // Shift ended before this one fired — nothing to check, keep the row for audit.
      await prisma.pingChallenge.update({ where: { id: challenge.id }, data: { status: 'CANCELLED' } });
      continue;
    }

    await prisma.pingChallenge.update({ where: { id: challenge.id }, data: { status: 'PENDING', sentAt: new Date() } });

    sendPushToEmployee(challenge.employeeId, {
      title: CHALLENGE_TITLE,
      body: CHALLENGE_BODY,
      url: `/?pingChallenge=${challenge.id}&entryId=${challenge.timeEntryId}`,
    }).catch(() => {});
  }
}

async function sweepMissedChallenges() {
  const deadline = new Date(Date.now() - RESPONSE_DEADLINE_MINUTES * 60 * 1000);
  await prisma.pingChallenge.updateMany({
    where: { status: 'PENDING', sentAt: { lt: deadline } },
    data: { status: 'MISSED' },
  });
}

export function startScheduler() {
  setInterval(() => {
    scheduleForNewlyEligibleShifts().catch((err) => console.error('scheduleForNewlyEligibleShifts failed:', err));
    dispatchDueChallenges().catch((err) => console.error('dispatchDueChallenges failed:', err));
    sweepMissedChallenges().catch((err) => console.error('sweepMissedChallenges failed:', err));
  }, SWEEP_INTERVAL_MS);
}
