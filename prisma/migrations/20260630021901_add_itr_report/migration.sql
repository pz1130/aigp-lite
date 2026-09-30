-- CreateEnum
CREATE TYPE "IncidentTrendReportStatus" AS ENUM ('draft', 'published', 'superseded');

-- CreateTable
CREATE TABLE "itr_report" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "IncidentTrendReportStatus" NOT NULL DEFAULT 'draft',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "statsJson" JSONB NOT NULL DEFAULT '{}',
    "deltaJson" JSONB,
    "execSummary" TEXT NOT NULL DEFAULT '',
    "diagnostics" JSONB NOT NULL DEFAULT '[]',
    "providerType" TEXT NOT NULL DEFAULT 'unknown',
    "model" TEXT NOT NULL DEFAULT 'unknown',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "incidentCount" INTEGER NOT NULL DEFAULT 0,
    "generatedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itr_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itr_cluster" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "narrative" TEXT NOT NULL DEFAULT '',
    "systemicRecommendation" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT '',
    "memberIncidentIds" JSONB NOT NULL DEFAULT '[]',
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "dominantCategory" "IncidentCategory",
    "dominantSeverity" "IncidentSeverity" NOT NULL DEFAULT 'high',
    "isLongTail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itr_cluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itr_report_orgId_status_idx" ON "itr_report"("orgId", "status");

-- CreateIndex
CREATE INDEX "itr_report_orgId_version_idx" ON "itr_report"("orgId", "version");

-- CreateIndex
CREATE INDEX "itr_cluster_orgId_reportId_idx" ON "itr_cluster"("orgId", "reportId");

-- AddForeignKey
ALTER TABLE "itr_report" ADD CONSTRAINT "itr_report_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itr_report" ADD CONSTRAINT "itr_report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itr_cluster" ADD CONSTRAINT "itr_cluster_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itr_cluster" ADD CONSTRAINT "itr_cluster_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "itr_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
