-- CreateEnum
CREATE TYPE "FairnessStatus" AS ENUM ('draft', 'completed');

-- CreateEnum
CREATE TYPE "FairnessCheck" AS ENUM ('yes', 'no', 'not_applicable');

-- CreateEnum
CREATE TYPE "FairnessMetricKind" AS ENUM ('selection_rate', 'true_positive_rate', 'error_rate', 'precision');

-- CreateTable
CREATE TABLE "usecase_fairness_assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "status" "FairnessStatus" NOT NULL DEFAULT 'draft',
    "proxyReview" "FairnessCheck",
    "feedbackLoop" "FairnessCheck",
    "notes" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usecase_fairness_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fairness_attribute" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" "FairnessMetricKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fairness_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fairness_subgroup" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "fairness_subgroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usecase_fairness_assessment_usecaseId_key" ON "usecase_fairness_assessment"("usecaseId");

-- CreateIndex
CREATE INDEX "usecase_fairness_assessment_orgId_idx" ON "usecase_fairness_assessment"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "fairness_attribute_assessmentId_name_key" ON "fairness_attribute"("assessmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fairness_subgroup_attributeId_label_key" ON "fairness_subgroup"("attributeId", "label");

-- AddForeignKey
ALTER TABLE "usecase_fairness_assessment" ADD CONSTRAINT "usecase_fairness_assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fairness_assessment" ADD CONSTRAINT "usecase_fairness_assessment_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fairness_assessment" ADD CONSTRAINT "usecase_fairness_assessment_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fairness_attribute" ADD CONSTRAINT "fairness_attribute_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "usecase_fairness_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fairness_subgroup" ADD CONSTRAINT "fairness_subgroup_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "fairness_attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
