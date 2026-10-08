CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'MERCADOPAGO', 'OTHER');

CREATE TABLE "PerformedService" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "appointmentId" UUID,
    "price" DECIMAL(14,2) NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "voidedById" UUID,

    CONSTRAINT "PerformedService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "externalReference" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "voidedById" UUID,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PerformedService_organizationId_patientId_performedAt_idx" ON "PerformedService"("organizationId", "patientId", "performedAt");

CREATE INDEX "Payment_organizationId_patientId_receivedAt_idx" ON "Payment"("organizationId", "patientId", "receivedAt");

CREATE INDEX "PaymentAllocation_serviceId_idx" ON "PaymentAllocation"("serviceId");

CREATE UNIQUE INDEX "PaymentAllocation_paymentId_serviceId_key" ON "PaymentAllocation"("paymentId", "serviceId");

ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "PerformedService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_price_positive" CHECK ("price" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0);

CREATE FUNCTION financial_record_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% no admite borrados', TG_TABLE_NAME;
  END IF;
  IF OLD."voidedAt" IS NOT NULL
     OR (to_jsonb(NEW) - 'voidedAt' - 'voidReason' - 'voidedById')
        IS DISTINCT FROM (to_jsonb(OLD) - 'voidedAt' - 'voidReason' - 'voidedById') THEN
    RAISE EXCEPTION '% solo admite su anulacion', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PerformedService_guard"
  BEFORE UPDATE OR DELETE ON "PerformedService"
  FOR EACH ROW EXECUTE FUNCTION financial_record_guard();

CREATE TRIGGER "Payment_guard"
  BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION financial_record_guard();

CREATE FUNCTION payment_allocation_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PaymentAllocation es inmutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentAllocation_immutable"
  BEFORE UPDATE OR DELETE ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION payment_allocation_immutable();
