-- CreateEnum
CREATE TYPE "MaterialityTier" AS ENUM ('minimal', 'limited', 'high', 'critical');

-- CreateTable
CREATE TABLE "usecase_materiality" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "affectedParties" INTEGER NOT NULL,
    "decisionConsequence" INTEGER NOT NULL,
    "financialSafety" INTEGER NOT NULL,
    "dataSensitivity" INTEGER NOT NULL,
    "computedTier" "MaterialityTier" NOT NULL,
    "tierOverride" "MaterialityTier",
    "overrideReason" TEXT,
    "assessedById" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usecase_materiality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usecase_materiality_usecaseId_key" ON "usecase_materiality"("usecaseId");

-- CreateIndex
CREATE INDEX "usecase_materiality_orgId_idx" ON "usecase_materiality"("orgId");

-- AddForeignKey
ALTER TABLE "usecase_materiality" ADD CONSTRAINT "usecase_materiality_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_materiality" ADD CONSTRAINT "usecase_materiality_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_materiality" ADD CONSTRAINT "usecase_materiality_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
