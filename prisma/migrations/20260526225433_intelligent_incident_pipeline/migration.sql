-- AlterTable
ALTER TABLE "incident" ADD COLUMN     "autoCreatedFromPolicyEvalId" TEXT,
ADD COLUMN     "embedding" JSONB,
ADD COLUMN     "mergedIntoId" TEXT;

-- CreateTable
CREATE TABLE "incident_merge_suggestion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "candidateIncidentId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "suggestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,

    CONSTRAINT "incident_merge_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_incident_automation_config" (
    "orgId" TEXT NOT NULL,
    "autoOpenEnabled" BOOLEAN NOT NULL DEFAULT true,
    "blockAlwaysOpens" BOOLEAN NOT NULL DEFAULT true,
    "hitBurstThreshold" INTEGER NOT NULL DEFAULT 5,
    "hitBurstWindowMin" INTEGER NOT NULL DEFAULT 10,
    "dedupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dedupSimilarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "dedupLookbackDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "org_incident_automation_config_pkey" PRIMARY KEY ("orgId")
);

-- CreateIndex
CREATE INDEX "incident_merge_suggestion_orgId_incidentId_idx" ON "incident_merge_suggestion"("orgId", "incidentId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_merge_suggestion_incidentId_candidateIncidentId_key" ON "incident_merge_suggestion"("incidentId", "candidateIncidentId");

-- CreateIndex
CREATE INDEX "incident_orgId_mergedIntoId_idx" ON "incident"("orgId", "mergedIntoId");

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_merge_suggestion" ADD CONSTRAINT "incident_merge_suggestion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_merge_suggestion" ADD CONSTRAINT "incident_merge_suggestion_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_merge_suggestion" ADD CONSTRAINT "incident_merge_suggestion_candidateIncidentId_fkey" FOREIGN KEY ("candidateIncidentId") REFERENCES "incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_merge_suggestion" ADD CONSTRAINT "incident_merge_suggestion_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_merge_suggestion" ADD CONSTRAINT "incident_merge_suggestion_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_incident_automation_config" ADD CONSTRAINT "org_incident_automation_config_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_incident_automation_config" ADD CONSTRAINT "org_incident_automation_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

