CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

ALTER TABLE "Payment" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'ARS',
ADD COLUMN     "exchangeRate" DECIMAL(12,2) NOT NULL DEFAULT 1,
ADD COLUMN     "originalAmount" DECIMAL(14,2);

ALTER TABLE "Payment" DISABLE TRIGGER "Payment_guard";
UPDATE "Payment" SET "originalAmount" = "amount";
ALTER TABLE "Payment" ENABLE TRIGGER "Payment_guard";
ALTER TABLE "Payment" ALTER COLUMN "originalAmount" SET NOT NULL;

CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "setById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExchangeRate_organizationId_currency_createdAt_idx" ON "ExchangeRate"("organizationId", "currency", "createdAt");

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_check" CHECK (
  "originalAmount" > 0 AND "exchangeRate" > 0 AND (
    ("currency" = 'ARS' AND "exchangeRate" = 1 AND "originalAmount" = "amount")
    OR ("currency" <> 'ARS' AND "amount" = round("originalAmount" * "exchangeRate", 2))
  )
);

ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_rate_check" CHECK ("rate" > 0 AND "currency" <> 'ARS');

CREATE FUNCTION exchange_rate_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ExchangeRate es de solo agregado';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExchangeRate_append_only"
  BEFORE UPDATE OR DELETE ON "ExchangeRate"
  FOR EACH ROW EXECUTE FUNCTION exchange_rate_append_only();
