-- CreateTable
CREATE TABLE "ping_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeEntryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    "lat" REAL,
    "lng" REAL,
    "distanceMeters" REAL,
    "outsideGeofence" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "ping_challenges_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ping_challenges_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ping_challenges_timeEntryId_idx" ON "ping_challenges"("timeEntryId");

-- CreateIndex
CREATE INDEX "ping_challenges_status_idx" ON "ping_challenges"("status");
