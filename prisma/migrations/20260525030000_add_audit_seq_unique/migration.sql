-- CreateIndex
CREATE UNIQUE INDEX "audit_log_orgId_seqNum_key" ON "audit_log"("orgId", "seqNum");
