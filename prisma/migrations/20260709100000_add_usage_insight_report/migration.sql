-- CreateEnum
CREATE TYPE "UsageInsightReportStatus" AS ENUM ('draft', 'published', 'superseded');

-- CreateTable
CREATE TABLE "usage_insight_report" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "UsageInsightReportStatus" NOT NULL DEFAULT 'draft',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "k" INTEGER NOT NULL DEFAULT 5,
    "statsJson" JSONB NOT NULL DEFAULT '{}',
    "deltaJson" JSONB,
    "execSummary" TEXT NOT NULL DEFAULT '',
    "diagnostics" JSONB NOT NULL DEFAULT '[]',
    "providerType" TEXT NOT NULL DEFAULT 'unknown',
    "model" TEXT NOT NULL DEFAULT 'unknown',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "totalInvocations" INTEGER NOT NULL DEFAULT 0,
    "clusterCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedClusterCount" INTEGER NOT NULL DEFAULT 0,
    "generatedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_insight_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_insight_cluster" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "themeLabel" TEXT NOT NULL DEFAULT '',
    "narrative" TEXT NOT NULL DEFAULT '',
    "systemicObservation" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT '',
    "invocationCount" INTEGER NOT NULL DEFAULT 0,
    "distinctActorCount" INTEGER NOT NULL DEFAULT 0,
    "topToolNames" JSONB NOT NULL DEFAULT '[]',
    "outcomeBreakdown" JSONB NOT NULL DEFAULT '{}',
    "deltaVsPrior" JSONB,
    "isLongTail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_insight_cluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_insight_report_orgId_status_idx" ON "usage_insight_report"("orgId", "status");

-- CreateIndex
CREATE INDEX "usage_insight_report_orgId_version_idx" ON "usage_insight_report"("orgId", "version");

-- CreateIndex
CREATE INDEX "usage_insight_cluster_orgId_reportId_idx" ON "usage_insight_cluster"("orgId", "reportId");

-- AddForeignKey
ALTER TABLE "usage_insight_report" ADD CONSTRAINT "usage_insight_report_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_insight_report" ADD CONSTRAINT "usage_insight_report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_insight_cluster" ADD CONSTRAINT "usage_insight_cluster_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_insight_cluster" ADD CONSTRAINT "usage_insight_cluster_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "usage_insight_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;