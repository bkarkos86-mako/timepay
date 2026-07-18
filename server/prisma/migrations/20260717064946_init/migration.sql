-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "systemRole" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hireDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "employee_job_roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "hourlyRate" REAL NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "employee_job_roles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "time_entries" (
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
    "isUndertime" BOOLEAN NOT NULL DEFAULT false,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
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

-- CreateTable
CREATE TABLE "break_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timeEntryId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BREAK',
    "breakStart" DATETIME NOT NULL,
    "breakEnd" DATETIME,
    CONSTRAINT "break_entries_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accrualPerMonth" REAL NOT NULL DEFAULT 0,
    "maxBalance" REAL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "balanceHours" REAL NOT NULL DEFAULT 0,
    "lastAccrualDate" DATETIME,
    CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "hoursTotal" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_requests_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staffing_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "maxConcurrentLeave" INTEGER NOT NULL,
    "blackoutStart" DATETIME,
    "blackoutEnd" DATETIME
);

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "exportedAt" DATETIME
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "multiplierOverride" REAL
);

-- CreateTable
CREATE TABLE "pay_rule_config" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "otDailyThresholdHours" REAL NOT NULL DEFAULT 8,
    "otMultiplier" REAL NOT NULL DEFAULT 1.25,
    "nightDiffStartHour" INTEGER NOT NULL DEFAULT 22,
    "nightDiffEndHour" INTEGER NOT NULL DEFAULT 6,
    "nightDiffMultiplier" REAL NOT NULL DEFAULT 1.10,
    "regularHolidayMultiplier" REAL NOT NULL DEFAULT 2.0,
    "specialHolidayMultiplier" REAL NOT NULL DEFAULT 1.30,
    "restDayMultiplier" REAL NOT NULL DEFAULT 1.30
);

-- CreateTable
CREATE TABLE "gov_contribution_brackets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "minSalary" REAL NOT NULL,
    "maxSalary" REAL,
    "employeeContribution" REAL NOT NULL,
    "employerContribution" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changeDescription" TEXT NOT NULL,
    "reason" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employee_job_roles_employeeId_idx" ON "employee_job_roles"("employeeId");

-- CreateIndex
CREATE INDEX "shifts_employeeId_date_idx" ON "shifts"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_correctionOfId_key" ON "time_entries"("correctionOfId");

-- CreateIndex
CREATE INDEX "time_entries_employeeId_clockIn_idx" ON "time_entries"("employeeId", "clockIn");

-- CreateIndex
CREATE INDEX "break_entries_timeEntryId_idx" ON "break_entries"("timeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employeeId_leaveTypeId_key" ON "leave_balances"("employeeId", "leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_startDate_idx" ON "leave_requests"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");
