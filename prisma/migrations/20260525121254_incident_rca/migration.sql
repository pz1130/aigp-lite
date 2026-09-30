-- CreateEnum
CREATE TYPE "IncidentRcaStatus" AS ENUM ('ok', 'needs_review', 'failed');

-- CreateTable
CREATE TABLE "incident_rca_draft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" "IncidentRcaStatus" NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "providerType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "rootCause" TEXT NOT NULL DEFAULT '',
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "rawOutput" JSONB NOT NULL,
    "diagnostics" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "incident_rca_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_rca_draft_orgId_incidentId_requestedAt_idx" ON "incident_rca_draft"("orgId", "incidentId", "requestedAt" DESC);

-- AddForeignKey
ALTER TABLE "incident_rca_draft" ADD CONSTRAINT "incident_rca_draft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_rca_draft" ADD CONSTRAINT "incident_rca_draft_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_rca_draft" ADD CONSTRAINT "incident_rca_draft_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_rca_draft" ADD CONSTRAINT "incident_rca_draft_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
