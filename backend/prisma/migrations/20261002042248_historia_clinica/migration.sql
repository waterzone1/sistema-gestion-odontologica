CREATE TYPE "ClinicalEntryType" AS ENUM ('EVOLUTION', 'CORRECTION');

CREATE TABLE "ClinicalEntry" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "appointmentId" UUID,
    "entryType" "ClinicalEntryType" NOT NULL,
    "content" TEXT NOT NULL,
    "correctionOfId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClinicalEntry_patientId_createdAt_idx" ON "ClinicalEntry"("patientId", "createdAt");

CREATE INDEX "ClinicalEntry_correctionOfId_idx" ON "ClinicalEntry"("correctionOfId");

ALTER TABLE "ClinicalEntry" ADD CONSTRAINT "ClinicalEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalEntry" ADD CONSTRAINT "ClinicalEntry_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalEntry" ADD CONSTRAINT "ClinicalEntry_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalEntry" ADD CONSTRAINT "ClinicalEntry_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "ClinicalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION clinical_entry_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ClinicalEntry es append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClinicalEntry_append_only"
  BEFORE UPDATE OR DELETE ON "ClinicalEntry"
  FOR EACH ROW EXECUTE FUNCTION clinical_entry_append_only();
