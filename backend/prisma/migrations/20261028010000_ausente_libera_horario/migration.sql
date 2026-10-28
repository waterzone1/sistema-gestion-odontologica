ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_no_overlap";

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap"
  EXCLUDE USING gist ("professionalId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));
