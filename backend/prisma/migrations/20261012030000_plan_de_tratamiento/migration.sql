CREATE TYPE "TreatmentPlanStatus" AS ENUM ('DRAFT', 'ACCEPTED', 'COMPLETED', 'CANCELLED');

CREATE TYPE "TreatmentItemStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

ALTER TABLE "PerformedService" ADD COLUMN     "surfaces" "ToothSurface"[],
ADD COLUMN     "tooth" INTEGER,
ADD COLUMN     "treatmentItemId" UUID;

CREATE TABLE "TreatmentPlan" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "title" TEXT,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreatmentItem" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "tooth" INTEGER,
    "surfaces" "ToothSurface"[],
    "notes" TEXT,
    "agreedPrice" DECIMAL(14,2),
    "status" "TreatmentItemStatus" NOT NULL DEFAULT 'PLANNED',
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TreatmentItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TreatmentPlan_organizationId_patientId_createdAt_idx" ON "TreatmentPlan"("organizationId", "patientId", "createdAt");

CREATE INDEX "TreatmentItem_planId_idx" ON "TreatmentItem"("planId");

ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_agreedPrice_positive" CHECK ("agreedPrice" IS NULL OR "agreedPrice" > 0);
