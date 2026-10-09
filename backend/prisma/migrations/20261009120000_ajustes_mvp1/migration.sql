DROP INDEX "PaymentAllocation_paymentId_serviceId_key";

CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

ALTER TABLE "Patient" DROP COLUMN "emergencyContact";

ALTER TABLE "PerformedService" ADD COLUMN "catalogPrice" DECIMAL(14,2);
ALTER TABLE "PerformedService" DISABLE TRIGGER "PerformedService_guard";
UPDATE "PerformedService" SET "catalogPrice" = "price";
ALTER TABLE "PerformedService" ENABLE TRIGGER "PerformedService_guard";
ALTER TABLE "PerformedService" ALTER COLUMN "catalogPrice" SET NOT NULL;
ALTER TABLE "PerformedService" ADD CONSTRAINT "PerformedService_catalogPrice_positive" CHECK ("catalogPrice" > 0);

CREATE OR REPLACE FUNCTION financial_record_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% no admite borrados', TG_TABLE_NAME;
  END IF;
  IF OLD."voidedAt" IS NOT NULL
     OR (to_jsonb(NEW) - 'voidedAt' - 'voidReason' - 'voidedById' - 'price')
        IS DISTINCT FROM (to_jsonb(OLD) - 'voidedAt' - 'voidReason' - 'voidedById' - 'price') THEN
    RAISE EXCEPTION '% solo admite su anulacion o el ajuste de precio', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
