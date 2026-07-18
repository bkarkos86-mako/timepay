-- CreateTable
CREATE TABLE "location_pings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeEntryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "distanceMeters" REAL,
    "outsideGeofence" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "location_pings_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "location_pings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "geofence_incidents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeEntryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolution" TEXT,
    "resolvedById" TEXT,
    "verificationPhotoUrl" TEXT,
    "lastLat" REAL,
    "lastLng" REAL,
    "lastDistanceMeters" REAL,
    CONSTRAINT "geofence_incidents_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "geofence_incidents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "geofence_incidents_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "location_pings_timeEntryId_recordedAt_idx" ON "location_pings"("timeEntryId", "recordedAt");

-- CreateIndex
CREATE INDEX "geofence_incidents_timeEntryId_idx" ON "geofence_incidents"("timeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
