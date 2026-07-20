-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_employee_job_roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "hourlyRate" REAL NOT NULL,
    "dailyAllowance" REAL NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "employee_job_roles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_employee_job_roles" ("employeeId", "hourlyRate", "id", "isDefault", "roleName") SELECT "employeeId", "hourlyRate", "id", "isDefault", "roleName" FROM "employee_job_roles";
DROP TABLE "employee_job_roles";
ALTER TABLE "new_employee_job_roles" RENAME TO "employee_job_roles";
CREATE INDEX "employee_job_roles_employeeId_idx" ON "employee_job_roles"("employeeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
