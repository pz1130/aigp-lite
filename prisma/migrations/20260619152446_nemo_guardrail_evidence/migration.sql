-- CreateTable
CREATE TABLE "nemo_guardrail_evidence" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "obligationCode" TEXT NOT NULL,
    "configRef" TEXT NOT NULL,
    "approvalGatePassed" BOOLEAN NOT NULL,
    "killSwitchPassed" BOOLEAN NOT NULL,
    "transcript" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "nemo_guardrail_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nemo_guardrail_evidence_orgId_obligationCode_idx" ON "nemo_guardrail_evidence"("orgId", "obligationCode");

-- AddForeignKey
ALTER TABLE "nemo_guardrail_evidence" ADD CONSTRAINT "nemo_guardrail_evidence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
