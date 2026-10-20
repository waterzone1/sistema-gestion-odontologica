CREATE INDEX "CreditApplication_organizationId_createdAt_idx" ON "CreditApplication"("organizationId", "createdAt");

CREATE INDEX "Payment_organizationId_receivedAt_idx" ON "Payment"("organizationId", "receivedAt");

CREATE INDEX "PerformedService_appointmentId_idx" ON "PerformedService"("appointmentId");

CREATE INDEX "PerformedService_treatmentItemId_idx" ON "PerformedService"("treatmentItemId");

