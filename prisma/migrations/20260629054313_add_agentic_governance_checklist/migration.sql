-- CreateEnum
CREATE TYPE "AgChkStatus" AS ENUM ('draft', 'submitted', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "AgChkAnswerState" AS ENUM ('unanswered', 'yes', 'no', 'na');

-- CreateTable
CREATE TABLE "ag_chk_section" (
    "id" TEXT NOT NULL,
    "num" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "seeAlso" JSONB NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL,

    CONSTRAINT "ag_chk_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ag_chk_item" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "guidance" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ag_chk_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ag_chk_assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "AgChkStatus" NOT NULL DEFAULT 'draft',
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

    CONSTRAINT "ag_chk_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ag_chk_answer" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "status" "AgChkAnswerState" NOT NULL DEFAULT 'unanswered',
    "elaboration" TEXT,
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ag_chk_answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ag_chk_section_num_key" ON "ag_chk_section"("num");

-- CreateIndex
CREATE UNIQUE INDEX "ag_chk_section_key_key" ON "ag_chk_section"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ag_chk_item_code_key" ON "ag_chk_item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ag_chk_assessment_supersededById_key" ON "ag_chk_assessment"("supersededById");

-- CreateIndex
CREATE INDEX "ag_chk_assessment_orgId_usecaseId_status_idx" ON "ag_chk_assessment"("orgId", "usecaseId", "status");

-- CreateIndex
CREATE INDEX "ag_chk_assessment_orgId_status_updatedAt_idx" ON "ag_chk_assessment"("orgId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ag_chk_assessment_usecaseId_version_key" ON "ag_chk_assessment"("usecaseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ag_chk_answer_assessmentId_itemCode_key" ON "ag_chk_answer"("assessmentId", "itemCode");

-- AddForeignKey
ALTER TABLE "ag_chk_item" ADD CONSTRAINT "ag_chk_item_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ag_chk_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_assessment" ADD CONSTRAINT "ag_chk_assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_assessment" ADD CONSTRAINT "ag_chk_assessment_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_assessment" ADD CONSTRAINT "ag_chk_assessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_assessment" ADD CONSTRAINT "ag_chk_assessment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_assessment" ADD CONSTRAINT "ag_chk_assessment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_assessment" ADD CONSTRAINT "ag_chk_assessment_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_assessment" ADD CONSTRAINT "ag_chk_assessment_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ag_chk_assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ag_chk_answer" ADD CONSTRAINT "ag_chk_answer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ag_chk_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
