import { prisma } from '../db.js';

// Every mutation to a time entry or leave balance should call this so the
// audit trail always records who changed what and why.
export async function logAudit({ entityType, entityId, changedById, changeDescription, reason, oldValue, newValue }) {
  return prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      changedById,
      changeDescription,
      reason: reason ?? null,
      oldValue: oldValue !== undefined ? JSON.stringify(oldValue) : null,
      newValue: newValue !== undefined ? JSON.stringify(newValue) : null,
    },
  });
}
