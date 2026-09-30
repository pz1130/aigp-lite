-- CreateEnum
CREATE TYPE "TxrStatus" AS ENUM ('draft', 'submitted', 'approved', 'published', 'superseded');

-- CreateTable
CREATE TABLE "txr_report" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TxrStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "snapshot" JSONB,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "txr_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "txr_report_supersededById_key" ON "txr_report"("supersededById");

-- CreateIndex
CREATE INDEX "txr_report_orgId_usecaseId_status_idx" ON "txr_report"("orgId", "usecaseId", "status");

-- CreateIndex
CREATE INDEX "txr_report_orgId_status_updatedAt_idx" ON "txr_report"("orgId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "txr_report_orgId_usecaseId_version_key" ON "txr_report"("orgId", "usecaseId", "version");

-- AddForeignKey
ALTER TABLE "txr_report" ADD CONSTRAINT "txr_report_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txr_report" ADD CONSTRAINT "txr_report_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txr_report" ADD CONSTRAINT "txr_report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txr_report" ADD CONSTRAINT "txr_report_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txr_report" ADD CONSTRAINT "txr_report_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txr_report" ADD CONSTRAINT "txr_report_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "txr_report" ADD CONSTRAINT "txr_report_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "txr_report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
