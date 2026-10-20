CREATE TABLE "PatientNote" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedById" UUID,

    CONSTRAINT "PatientNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientNote_patientId_createdAt_idx" ON "PatientNote"("patientId", "createdAt");

ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PatientNote" ADD CONSTRAINT "PatientNote_content_check" CHECK (length(btrim("content")) BETWEEN 1 AND 1000);

CREATE FUNCTION patient_note_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PatientNote no admite borrados';
  END IF;
  IF OLD."archivedAt" IS NOT NULL
     OR (to_jsonb(NEW) - 'archivedAt' - 'archivedById') IS DISTINCT FROM (to_jsonb(OLD) - 'archivedAt' - 'archivedById') THEN
    RAISE EXCEPTION 'PatientNote solo admite archivarse';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PatientNote_guard"
  BEFORE UPDATE OR DELETE ON "PatientNote"
  FOR EACH ROW EXECUTE FUNCTION patient_note_guard();
