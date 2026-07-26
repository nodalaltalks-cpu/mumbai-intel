-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");

-- CreateIndex
CREATE INDEX "Project_launchDate_idx" ON "Project"("launchDate");

-- CreateIndex
CREATE INDEX "Transaction_valuePaise_idx" ON "Transaction"("valuePaise");

-- CreateIndex
CREATE INDEX "Transaction_pricePerSqftPaise_idx" ON "Transaction"("pricePerSqftPaise");
