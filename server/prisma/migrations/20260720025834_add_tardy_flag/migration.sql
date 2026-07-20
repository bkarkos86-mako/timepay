-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_time_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "roleName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CLOCK',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "clockIn" DATETIME NOT NULL,
    "clockInPhotoUrl" TEXT,
    "clockInLat" REAL,
    "clockInLng" REAL,
    "clockOut" DATETIME,
    "clockOutPhotoUrl" TEXT,
    "clockOutLat" REAL,
    "clockOutLng" REAL,
    "reason" TEXT,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "isTardy" BOOLEAN NOT NULL DEFAULT false,
    "isUndertime" BOOLEAN NOT NULL DEFAULT false,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "clockInDistanceMeters" REAL,
    "clockInOutsideGeofence" BOOLEAN NOT NULL DEFAULT false,
    "clockOutDistanceMeters" REAL,
    "clockOutOutsideGeofence" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "correctionOfId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "time_entries_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "time_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "time_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "time_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "time_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_time_entries" ("approvedAt", "approvedById", "clockIn", "clockInDistanceMeters", "clockInLat", "clockInLng", "clockInOutsideGeofence", "clockInPhotoUrl", "clockOut", "clockOutDistanceMeters", "clockOutLat", "clockOutLng", "clockOutOutsideGeofence", "clockOutPhotoUrl", "correctionOfId", "createdAt", "employeeId", "id", "isLate", "isUndertime", "lateMinutes", "reason", "roleName", "shiftId", "status", "type", "undertimeMinutes", "updatedAt") SELECT "approvedAt", "approvedById", "clockIn", "clockInDistanceMeters", "clockInLat", "clockInLng", "clockInOutsideGeofence", "clockInPhotoUrl", "clockOut", "clockOutDistanceMeters", "clockOutLat", "clockOutLng", "clockOutOutsideGeofence", "clockOutPhotoUrl", "correctionOfId", "createdAt", "employeeId", "id", "isLate", "isUndertime", "lateMinutes", "reason", "roleName", "shiftId", "status", "type", "undertimeMinutes", "updatedAt" FROM "time_entries";
DROP TABLE "time_entries";
ALTER TABLE "new_time_entries" RENAME TO "time_entries";
CREATE UNIQUE INDEX "time_entries_correctionOfId_key" ON "time_entries"("correctionOfId");
CREATE INDEX "time_entries_employeeId_clockIn_idx" ON "time_entries"("employeeId", "clockIn");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
