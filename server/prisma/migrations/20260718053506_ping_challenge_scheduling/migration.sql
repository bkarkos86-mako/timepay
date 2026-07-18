-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ping_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeEntryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "respondedAt" DATETIME,
    "lat" REAL,
    "lng" REAL,
    "distanceMeters" REAL,
    "outsideGeofence" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    CONSTRAINT "ping_challenges_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ping_challenges_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ping_challenges" ("distanceMeters", "employeeId", "id", "lat", "lng", "outsideGeofence", "respondedAt", "sentAt", "status", "timeEntryId") SELECT "distanceMeters", "employeeId", "id", "lat", "lng", "outsideGeofence", "respondedAt", "sentAt", "status", "timeEntryId" FROM "ping_challenges";
DROP TABLE "ping_challenges";
ALTER TABLE "new_ping_challenges" RENAME TO "ping_challenges";
CREATE INDEX "ping_challenges_timeEntryId_idx" ON "ping_challenges"("timeEntryId");
CREATE INDEX "ping_challenges_status_idx" ON "ping_challenges"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
