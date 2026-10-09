CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

ALTER TABLE "ProfessionalProfile" ADD COLUMN     "color" TEXT;

ALTER TABLE "User" ADD COLUMN     "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM';

