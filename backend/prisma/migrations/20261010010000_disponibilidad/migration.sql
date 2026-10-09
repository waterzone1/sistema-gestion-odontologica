CREATE TYPE "AvailabilityExceptionType" AS ENUM ('BLOCK', 'VACATION', 'ABSENCE', 'EXTRA');

ALTER TABLE "Appointment" ADD COLUMN     "availabilityOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overrideReason" TEXT;

ALTER TABLE "ProfessionalProfile" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

CREATE TABLE "AvailabilityRule" (
    "id" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityException" (
    "id" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "branchId" UUID,
    "type" "AvailabilityExceptionType" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" UUID,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfessionalPractice" (
    "professionalId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,

    CONSTRAINT "ProfessionalPractice_pkey" PRIMARY KEY ("professionalId","practiceId")
);

CREATE INDEX "AvailabilityRule_professionalId_weekday_idx" ON "AvailabilityRule"("professionalId", "weekday");

CREATE INDEX "AvailabilityException_professionalId_startsAt_idx" ON "AvailabilityException"("professionalId", "startsAt");

ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProfessionalPractice" ADD CONSTRAINT "ProfessionalPractice_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProfessionalPractice" ADD CONSTRAINT "ProfessionalPractice_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_valid_range"
  CHECK ("weekday" BETWEEN 1 AND 7 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");

ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_ends_after_starts" CHECK ("endsAt" > "startsAt");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_override_has_reason"
  CHECK (NOT "availabilityOverride" OR "overrideReason" IS NOT NULL);
