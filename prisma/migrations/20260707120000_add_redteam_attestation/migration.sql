-- CreateTable
CREATE TABLE "redteam_attestation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "attesterName" TEXT NOT NULL,
    "attesterOrg" TEXT NOT NULL DEFAULT '',
    "attesterContact" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL,
    "methodology" TEXT NOT NULL DEFAULT '',
    "engagementStart" TIMESTAMP(3),
    "engagementEnd" TIMESTAMP(3),
    "attestedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "storageKey" TEXT NOT NULL,
    "reportSha256" TEXT NOT NULL,
    "reportBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "redteam_attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "redteam_attestation_orgId_usecaseId_idx" ON "redteam_attestation"("orgId", "usecaseId");

-- CreateIndex
CREATE INDEX "redteam_attestation_orgId_createdAt_idx" ON "redteam_attestation"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "redteam_attestation" ADD CONSTRAINT "redteam_attestation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redteam_attestation" ADD CONSTRAINT "redteam_attestation_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redteam_attestation" ADD CONSTRAINT "redteam_attestation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
