-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_shifts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isRestDay" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_shifts" ("breakMinutes", "createdAt", "date", "employeeId", "id", "notes", "roleName", "scheduledEnd", "scheduledStart") SELECT "breakMinutes", "createdAt", "date", "employeeId", "id", "notes", "roleName", "scheduledEnd", "scheduledStart" FROM "shifts";
DROP TABLE "shifts";
ALTER TABLE "new_shifts" RENAME TO "shifts";
CREATE INDEX "shifts_employeeId_date_idx" ON "shifts"("employeeId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
