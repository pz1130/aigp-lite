-- CreateEnum
CREATE TYPE "GoLiveStatus" AS ENUM ('draft', 'approved', 'live', 'rejected', 'withdrawn');

-- AlterTable
ALTER TABLE "ai_usecase" ADD COLUMN     "humanOversightAttested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "humanOversightAttestedAt" TIMESTAMP(3),
ADD COLUMN     "humanOversightAttestedById" TEXT;

-- AlterTable
ALTER TABLE "drift_benchmark" ADD COLUMN     "usecaseId" TEXT;

-- AlterTable
ALTER TABLE "evaluation" ADD COLUMN     "usecaseId" TEXT;

-- CreateTable
CREATE TABLE "go_live_review" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "status" "GoLiveStatus" NOT NULL DEFAULT 'draft',
    "rationale" TEXT NOT NULL DEFAULT '',
    "conditions" TEXT[],
    "readinessSnapshot" JSONB NOT NULL DEFAULT '{}',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_live_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_live_review_supersededById_key" ON "go_live_review"("supersededById");

-- CreateIndex
CREATE INDEX "go_live_review_orgId_usecaseId_status_idx" ON "go_live_review"("orgId", "usecaseId", "status");

-- CreateIndex
CREATE INDEX "drift_benchmark_orgId_usecaseId_idx" ON "drift_benchmark"("orgId", "usecaseId");

-- CreateIndex
CREATE INDEX "evaluation_orgId_usecaseId_idx" ON "evaluation"("orgId", "usecaseId");

-- AddForeignKey
ALTER TABLE "drift_benchmark" ADD CONSTRAINT "drift_benchmark_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_live_review" ADD CONSTRAINT "go_live_review_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_live_review" ADD CONSTRAINT "go_live_review_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_live_review" ADD CONSTRAINT "go_live_review_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_live_review" ADD CONSTRAINT "go_live_review_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_live_review" ADD CONSTRAINT "go_live_review_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "go_live_review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
