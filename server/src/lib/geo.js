const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns null if there are no active worksites to check against (geofencing
// is opt-in). Otherwise returns the nearest worksite plus the distance to it.
export function findNearestWorksite(lat, lng, worksites) {
  const active = worksites.filter((w) => w.isActive);
  if (active.length === 0) return null;

  let nearest = null;
  let minDistance = Infinity;
  for (const site of active) {
    const distance = haversineDistanceMeters(lat, lng, site.lat, site.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = site;
    }
  }
  return { worksite: nearest, distanceMeters: minDistance, outsideGeofence: minDistance > nearest.radiusMeters };
}
