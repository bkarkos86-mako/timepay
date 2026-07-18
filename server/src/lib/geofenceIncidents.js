import { prisma } from '../db.js';
import { findNearestWorksite } from './geo.js';
import { sendPushToEmployee, sendPushToRoles } from './push.js';

// Checks a punch's coordinates against all active worksites. Returns nulls
// when no coordinates were submitted or no worksites are configured — the
// geofence check is opt-in and never blocks a punch, only flags it.
export async function checkGeofence(lat, lng) {
  if (lat == null || lng == null) return { distanceMeters: null, outsideGeofence: false };
  const worksites = await prisma.worksite.findMany({ where: { isActive: true } });
  const result = findNearestWorksite(Number(lat), Number(lng), worksites);
  if (!result) return { distanceMeters: null, outsideGeofence: false };
  return { distanceMeters: result.distanceMeters, outsideGeofence: result.outsideGeofence };
}

// Shared by the foreground location-ping loop and the push-based ping
// challenge: opens a GeofenceIncident (and notifies) on the first reading
// outside every worksite, keeps it updated on subsequent outside readings,
// and auto-resolves it as RETURNED the moment a reading lands back inside.
// Returns the still-open incident, or null if there isn't one.
export async function recordGeofenceCheck({ timeEntryId, employeeId, lat, lng, distanceMeters, outsideGeofence }) {
  let incident = await prisma.geofenceIncident.findFirst({ where: { timeEntryId, resolvedAt: null } });

  if (outsideGeofence) {
    if (!incident) {
      incident = await prisma.geofenceIncident.create({
        data: { timeEntryId, employeeId, lastLat: lat, lastLng: lng, lastDistanceMeters: distanceMeters },
      });

      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      const name = `${employee.firstName} ${employee.lastName}`;

      // Fire-and-forget: a push delivery failure should never break the caller's response.
      sendPushToRoles(['ADMIN', 'MANAGER'], {
        title: 'Employee left worksite area',
        body: `${name} is outside the geofenced area while still clocked in.`,
        url: '/admin',
      }).catch(() => {});
      sendPushToEmployee(employeeId, {
        title: "You're outside the worksite area",
        body: 'Please return to the worksite, or submit a photo to confirm your location.',
        url: '/',
      }).catch(() => {});
    } else {
      incident = await prisma.geofenceIncident.update({
        where: { id: incident.id },
        data: { lastLat: lat, lastLng: lng, lastDistanceMeters: distanceMeters },
      });
    }
  } else if (incident) {
    await prisma.geofenceIncident.update({
      where: { id: incident.id },
      data: { resolvedAt: new Date(), resolution: 'RETURNED', lastLat: lat, lastLng: lng, lastDistanceMeters: distanceMeters },
    });
    incident = null;
  }

  return incident;
}
