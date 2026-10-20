CREATE TYPE "ClinicalFileCategory" AS ENUM ('XRAY', 'STUDY', 'PHOTO', 'CONSENT', 'OTHER');

CREATE TABLE "ClinicalProfile" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "alerts" TEXT,
    "allergies" TEXT,
    "medications" TEXT,
    "background" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalFile" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "clinicalEntryId" UUID,
    "category" "ClinicalFileCategory" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedById" UUID,

    CONSTRAINT "ClinicalFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClinicalProfile_patientId_createdAt_idx" ON "ClinicalProfile"("patientId", "createdAt");

CREATE UNIQUE INDEX "ClinicalFile_storageKey_key" ON "ClinicalFile"("storageKey");

CREATE INDEX "ClinicalFile_patientId_createdAt_idx" ON "ClinicalFile"("patientId", "createdAt");

ALTER TABLE "ClinicalProfile" ADD CONSTRAINT "ClinicalProfile_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalProfile" ADD CONSTRAINT "ClinicalProfile_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalFile" ADD CONSTRAINT "ClinicalFile_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalFile" ADD CONSTRAINT "ClinicalFile_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalFile" ADD CONSTRAINT "ClinicalFile_clinicalEntryId_fkey" FOREIGN KEY ("clinicalEntryId") REFERENCES "ClinicalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClinicalFile" ADD CONSTRAINT "ClinicalFile_size_positive" CHECK ("size" > 0);

CREATE FUNCTION clinical_profile_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ClinicalProfile es append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClinicalProfile_append_only"
  BEFORE UPDATE OR DELETE ON "ClinicalProfile"
  FOR EACH ROW EXECUTE FUNCTION clinical_profile_append_only();

CREATE FUNCTION clinical_file_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ClinicalFile no admite borrados';
  END IF;
  IF OLD."archivedAt" IS NOT NULL
     OR (to_jsonb(NEW) - 'archivedAt' - 'archivedById') IS DISTINCT FROM (to_jsonb(OLD) - 'archivedAt' - 'archivedById') THEN
    RAISE EXCEPTION 'ClinicalFile solo admite archivarse';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClinicalFile_guard"
  BEFORE UPDATE OR DELETE ON "ClinicalFile"
  FOR EACH ROW EXECUTE FUNCTION clinical_file_guard();
