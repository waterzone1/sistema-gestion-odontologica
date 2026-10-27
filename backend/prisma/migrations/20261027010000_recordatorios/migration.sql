CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'CONFIRMED', 'CANCELLED', 'FAILED');

CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "failureReason" TEXT,
    "scheduledFor" DATE NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "sentById" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reminder_organizationId_scheduledFor_idx" ON "Reminder"("organizationId", "scheduledFor");

CREATE UNIQUE INDEX "Reminder_appointmentId_key" ON "Reminder"("appointmentId");

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_state_check" CHECK (
  ("status" <> 'FAILED' OR "failureReason" IS NOT NULL)
  AND ("status" NOT IN ('SENT', 'CONFIRMED') OR "sentAt" IS NOT NULL OR "confirmedAt" IS NOT NULL)
);

CREATE TRIGGER "Reminder_no_delete"
  BEFORE DELETE ON "Reminder"
  FOR EACH ROW EXECUTE FUNCTION liquidation_no_delete();
