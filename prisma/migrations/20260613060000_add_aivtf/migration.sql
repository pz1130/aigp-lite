-- CreateEnum
CREATE TYPE "AivtfStatus" AS ENUM ('draft', 'submitted', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "AivtfCheck" AS ENUM ('unanswered', 'yes', 'no', 'na');

-- CreateEnum
CREATE TYPE "AivtfAiType" AS ENUM ('ALL', 'GENAI_ONLY', 'TRADITIONAL_ONLY');

-- CreateTable
CREATE TABLE "aivtf_principle" (
    "id" TEXT NOT NULL,
    "num" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "aivtf_principle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aivtf_outcome" (
    "id" TEXT NOT NULL,
    "principleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "aivtf_outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aivtf_process" (
    "id" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "typeOfAI" "AivtfAiType" NOT NULL DEFAULT 'ALL',
    "evidenceType" TEXT,
    "evidenceGuidance" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "aivtf_process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aivtf_assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "AivtfStatus" NOT NULL DEFAULT 'draft',
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

    CONSTRAINT "aivtf_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aivtf_answer" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "processCode" TEXT NOT NULL,
    "status" "AivtfCheck" NOT NULL DEFAULT 'unanswered',
    "elaboration" TEXT,
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aivtf_answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aivtf_principle_num_key" ON "aivtf_principle"("num");

-- CreateIndex
CREATE UNIQUE INDEX "aivtf_principle_key_key" ON "aivtf_principle"("key");

-- CreateIndex
CREATE UNIQUE INDEX "aivtf_outcome_code_key" ON "aivtf_outcome"("code");

-- CreateIndex
CREATE UNIQUE INDEX "aivtf_process_code_key" ON "aivtf_process"("code");

-- CreateIndex
CREATE UNIQUE INDEX "aivtf_assessment_supersededById_key" ON "aivtf_assessment"("supersededById");

-- CreateIndex
CREATE INDEX "aivtf_assessment_orgId_usecaseId_status_idx" ON "aivtf_assessment"("orgId", "usecaseId", "status");

-- CreateIndex
CREATE INDEX "aivtf_assessment_orgId_status_updatedAt_idx" ON "aivtf_assessment"("orgId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "aivtf_assessment_usecaseId_version_key" ON "aivtf_assessment"("usecaseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "aivtf_answer_assessmentId_processCode_key" ON "aivtf_answer"("assessmentId", "processCode");

-- AddForeignKey
ALTER TABLE "aivtf_outcome" ADD CONSTRAINT "aivtf_outcome_principleId_fkey" FOREIGN KEY ("principleId") REFERENCES "aivtf_principle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_process" ADD CONSTRAINT "aivtf_process_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "aivtf_outcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_assessment" ADD CONSTRAINT "aivtf_assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_assessment" ADD CONSTRAINT "aivtf_assessment_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_assessment" ADD CONSTRAINT "aivtf_assessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_assessment" ADD CONSTRAINT "aivtf_assessment_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_assessment" ADD CONSTRAINT "aivtf_assessment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_assessment" ADD CONSTRAINT "aivtf_assessment_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_assessment" ADD CONSTRAINT "aivtf_assessment_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "aivtf_assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aivtf_answer" ADD CONSTRAINT "aivtf_answer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "aivtf_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

