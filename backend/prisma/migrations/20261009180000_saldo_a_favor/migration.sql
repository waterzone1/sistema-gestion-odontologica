ALTER TABLE "PaymentAllocation" ADD COLUMN     "creditApplicationId" UUID;

ALTER TABLE "ProfessionalProfile" DROP COLUMN "specialty";

CREATE TABLE "CreditApplication" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "voidedById" UUID,

    CONSTRAINT "CreditApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditApplication_organizationId_patientId_createdAt_idx" ON "CreditApplication"("organizationId", "patientId", "createdAt");

CREATE INDEX "PaymentAllocation_creditApplicationId_idx" ON "PaymentAllocation"("creditApplicationId");

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_creditApplicationId_fkey" FOREIGN KEY ("creditApplicationId") REFERENCES "CreditApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_amount_positive" CHECK ("amount" > 0);

CREATE TRIGGER "CreditApplication_guard"
  BEFORE UPDATE OR DELETE ON "CreditApplication"
  FOR EACH ROW EXECUTE FUNCTION financial_record_guard();
