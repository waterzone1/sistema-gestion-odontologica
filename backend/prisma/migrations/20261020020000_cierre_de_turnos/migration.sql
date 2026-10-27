CREATE TYPE "AppointmentClosureKind" AS ENUM ('TREATMENT_SESSION', 'NO_CHARGE');

ALTER TABLE "Appointment" ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "closedById" UUID,
ADD COLUMN     "closureKind" "AppointmentClosureKind",
ADD COLUMN     "closureReason" TEXT,
ADD COLUMN     "closureTreatmentItemId" UUID;

ALTER TABLE "TreatmentItem" ADD COLUMN     "completedAt" TIMESTAMPTZ(3),
ADD COLUMN     "completedById" UUID;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_closureTreatmentItemId_fkey" FOREIGN KEY ("closureTreatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_closure_check" CHECK (
  ("closureKind" IS NULL AND "closedAt" IS NULL AND "closedById" IS NULL AND "closureReason" IS NULL AND "closureTreatmentItemId" IS NULL)
  OR ("closureKind" = 'NO_CHARGE' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND length(btrim("closureReason")) >= 3 AND "closureTreatmentItemId" IS NULL)
  OR ("closureKind" = 'TREATMENT_SESSION' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "closureTreatmentItemId" IS NOT NULL)
);

ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_completed_check" CHECK (
  ("completedAt" IS NULL) = ("completedById" IS NULL)
  AND ("completedAt" IS NULL OR "status" = 'COMPLETED')
);
