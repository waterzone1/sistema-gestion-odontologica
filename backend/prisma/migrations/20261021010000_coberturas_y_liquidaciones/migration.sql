CREATE TYPE "CoverageKind" AS ENUM ('OBRA_SOCIAL', 'PREPAGA', 'OTHER');

CREATE TYPE "LiquidationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PAID', 'CANCELLED');

CREATE TYPE "LiquidationItemStatus" AS ENUM ('PENDING', 'APPROVED', 'DEBITED', 'REJECTED');

ALTER TABLE "PerformedService" ADD COLUMN     "authorizationCode" TEXT,
ADD COLUMN     "coverageAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "patientCoverageId" UUID;

CREATE TABLE "CoverageProvider" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CoverageKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CoverageProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoveragePlan" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CoveragePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientCoverage" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "affiliateNumber" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "notes" TEXT,
    "primary" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientCoverage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Agreement" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgreementItem" (
    "id" UUID NOT NULL,
    "agreementId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "insurerAmount" DECIMAL(14,2) NOT NULL,
    "patientCopay" DECIMAL(14,2) NOT NULL,
    "requiresAuthorization" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AgreementItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Liquidation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "status" "LiquidationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "paidAmount" DECIMAL(14,2),
    "paymentReference" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,

    CONSTRAINT "Liquidation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiquidationItem" (
    "id" UUID NOT NULL,
    "liquidationId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "claimedAmount" DECIMAL(14,2) NOT NULL,
    "status" "LiquidationItemStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAmount" DECIMAL(14,2),
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LiquidationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoverageProvider_organizationId_name_key" ON "CoverageProvider"("organizationId", "name");

CREATE UNIQUE INDEX "CoveragePlan_providerId_name_key" ON "CoveragePlan"("providerId", "name");

CREATE INDEX "PatientCoverage_patientId_idx" ON "PatientCoverage"("patientId");

CREATE INDEX "Agreement_planId_idx" ON "Agreement"("planId");

CREATE UNIQUE INDEX "AgreementItem_agreementId_practiceId_key" ON "AgreementItem"("agreementId", "practiceId");

CREATE INDEX "Liquidation_organizationId_createdAt_idx" ON "Liquidation"("organizationId", "createdAt");

CREATE INDEX "LiquidationItem_liquidationId_idx" ON "LiquidationItem"("liquidationId");

CREATE INDEX "LiquidationItem_serviceId_idx" ON "LiquidationItem"("serviceId");

CREATE INDEX "PerformedService_patientCoverageId_performedAt_idx" ON "PerformedService"("patientCoverageId", "performedAt");

ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_patientCoverageId_fkey" FOREIGN KEY ("patientCoverageId") REFERENCES "PatientCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoverageProvider" ADD CONSTRAINT "CoverageProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CoveragePlan" ADD CONSTRAINT "CoveragePlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "CoverageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CoveragePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CoveragePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AgreementItem" ADD CONSTRAINT "AgreementItem_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AgreementItem" ADD CONSTRAINT "AgreementItem_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "CoverageProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiquidationItem" ADD CONSTRAINT "LiquidationItem_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "Liquidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiquidationItem" ADD CONSTRAINT "LiquidationItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PerformedService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PerformedService" DROP CONSTRAINT "PerformedService_price_positive";
ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_amounts_check" CHECK (
  "price" >= 0 AND "coverageAmount" >= 0 AND "price" + "coverageAmount" > 0
  AND ("coverageAmount" = 0 OR "patientCoverageId" IS NOT NULL)
);

ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_validity_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE "PatientCoverage" ADD CONSTRAINT "PatientCoverage_affiliate_check" CHECK (length(btrim("affiliateNumber")) > 0);
CREATE UNIQUE INDEX "PatientCoverage_one_primary" ON "PatientCoverage"("patientId") WHERE "primary" AND "archivedAt" IS NULL;

CREATE FUNCTION patient_coverage_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PatientCoverage no admite borrados';
  END IF;
  IF OLD."archivedAt" IS NOT NULL
     OR (to_jsonb(NEW) - 'archivedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'archivedAt') THEN
    RAISE EXCEPTION 'PatientCoverage solo admite archivarse';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PatientCoverage_guard"
  BEFORE UPDATE OR DELETE ON "PatientCoverage"
  FOR EACH ROW EXECUTE FUNCTION patient_coverage_guard();

ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_validity_check" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_no_overlap"
  EXCLUDE USING gist ("planId" WITH =, daterange("validFrom", "validTo", '[]') WITH &&);

ALTER TABLE "AgreementItem" ADD CONSTRAINT "AgreementItem_amounts_check" CHECK (
  "insurerAmount" >= 0 AND "patientCopay" >= 0 AND "insurerAmount" + "patientCopay" > 0
);

ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_period_check" CHECK ("periodTo" >= "periodFrom");
ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_paid_check" CHECK (
  ("status" = 'PAID') = ("paidAt" IS NOT NULL) AND ("paidAt" IS NULL OR "paidAmount" >= 0)
);
ALTER TABLE "Liquidation" ADD CONSTRAINT "Liquidation_cancel_check" CHECK (
  ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL) AND ("cancelledAt" IS NULL OR length(btrim("cancelReason")) >= 3)
);

ALTER TABLE "LiquidationItem" ADD CONSTRAINT "LiquidationItem_amounts_check" CHECK (
  "claimedAmount" > 0 AND ("approvedAmount" IS NULL OR ("approvedAmount" >= 0 AND "approvedAmount" <= "claimedAmount"))
);
CREATE UNIQUE INDEX "LiquidationItem_one_active_per_service" ON "LiquidationItem"("serviceId") WHERE "active";

CREATE FUNCTION liquidation_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% no admite borrados', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Liquidation_no_delete"
  BEFORE DELETE ON "Liquidation"
  FOR EACH ROW EXECUTE FUNCTION liquidation_no_delete();

CREATE TRIGGER "LiquidationItem_no_delete"
  BEFORE DELETE ON "LiquidationItem"
  FOR EACH ROW EXECUTE FUNCTION liquidation_no_delete();
