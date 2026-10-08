CREATE TYPE "DocumentType" AS ENUM ('DNI', 'LE', 'LC', 'PASAPORTE', 'OTRO');

CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'DNI',
    "documentNumber" TEXT,
    "birthDate" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emergencyContact" TEXT,
    "searchText" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Patient_organizationId_archivedAt_idx" ON "Patient"("organizationId", "archivedAt");

CREATE UNIQUE INDEX "Patient_organizationId_documentType_documentNumber_key" ON "Patient"("organizationId", "documentType", "documentNumber");

ALTER TABLE "Patient" ADD CONSTRAINT "Patient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Patient_searchText_trgm_idx" ON "Patient" USING gin ("searchText" gin_trgm_ops);
