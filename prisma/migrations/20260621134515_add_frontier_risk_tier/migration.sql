-- CreateEnum
CREATE TYPE "FrtStatus" AS ENUM ('draft', 'submitted', 'approved', 'archived');

-- CreateTable
CREATE TABLE "frt_category" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "frt_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frt_threshold" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "guidance" TEXT,

    CONSTRAINT "frt_threshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frt_assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "FrtStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "frt_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frt_answer" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "thresholdCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unanswered',
    "elaboration" TEXT,
    "evidenceRefs" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "frt_answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "frt_category_code_key" ON "frt_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "frt_threshold_code_key" ON "frt_threshold"("code");

-- CreateIndex
CREATE INDEX "frt_threshold_categoryId_tier_order_idx" ON "frt_threshold"("categoryId", "tier", "order");

-- CreateIndex
CREATE UNIQUE INDEX "frt_assessment_supersededById_key" ON "frt_assessment"("supersededById");

-- CreateIndex
CREATE INDEX "frt_assessment_orgId_usecaseId_status_idx" ON "frt_assessment"("orgId", "usecaseId", "status");

-- CreateIndex
CREATE INDEX "frt_assessment_orgId_status_updatedAt_idx" ON "frt_assessment"("orgId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "frt_assessment_orgId_usecaseId_version_key" ON "frt_assessment"("orgId", "usecaseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "frt_answer_assessmentId_thresholdCode_key" ON "frt_answer"("assessmentId", "thresholdCode");

-- AddForeignKey
ALTER TABLE "frt_threshold" ADD CONSTRAINT "frt_threshold_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "frt_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_assessment" ADD CONSTRAINT "frt_assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_assessment" ADD CONSTRAINT "frt_assessment_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_assessment" ADD CONSTRAINT "frt_assessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_assessment" ADD CONSTRAINT "frt_assessment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_assessment" ADD CONSTRAINT "frt_assessment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_assessment" ADD CONSTRAINT "frt_assessment_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_assessment" ADD CONSTRAINT "frt_assessment_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "frt_assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frt_answer" ADD CONSTRAINT "frt_answer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "frt_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
