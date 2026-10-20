CREATE TYPE "ToothSurface" AS ENUM ('M', 'D', 'V', 'L', 'O');

CREATE TYPE "ToothCondition" AS ENUM ('HEALTHY', 'CARIES', 'RESTORATION', 'TEMP_RESTORATION', 'CROWN', 'ROOT_CANAL', 'IMPLANT', 'FRACTURE', 'MISSING', 'EXTRACTION_INDICATED', 'SEALANT', 'PROSTHESIS');

CREATE TABLE "ToothFinding" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "tooth" INTEGER NOT NULL,
    "surface" "ToothSurface",
    "condition" "ToothCondition" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToothFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ToothFinding_patientId_tooth_createdAt_idx" ON "ToothFinding"("patientId", "tooth", "createdAt");

ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_valid_tooth"
  CHECK (("tooth" / 10 BETWEEN 1 AND 4 AND "tooth" % 10 BETWEEN 1 AND 8) OR ("tooth" / 10 BETWEEN 5 AND 8 AND "tooth" % 10 BETWEEN 1 AND 5));

CREATE FUNCTION tooth_finding_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ToothFinding es append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ToothFinding_append_only"
  BEFORE UPDATE OR DELETE ON "ToothFinding"
  FOR EACH ROW EXECUTE FUNCTION tooth_finding_append_only();
