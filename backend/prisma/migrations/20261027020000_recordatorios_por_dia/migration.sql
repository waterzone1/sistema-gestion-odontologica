DROP INDEX "Reminder_appointmentId_key";

CREATE INDEX "PerformedService_organizationId_performedAt_idx" ON "PerformedService"("organizationId", "performedAt");

CREATE UNIQUE INDEX "Reminder_appointmentId_scheduledFor_key" ON "Reminder"("appointmentId", "scheduledFor");

