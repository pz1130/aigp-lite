-- CreateEnum
CREATE TYPE "RiskCopilotStatus" AS ENUM ('ok', 'needs_review', 'failed');

-- CreateEnum
CREATE TYPE "ItemDecision" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "RiskLinkSource" AS ENUM ('ai', 'manual');

-- AlterEnum
ALTER TYPE "RiskLevel" ADD VALUE 'critical';

-- CreateTable
CREATE TABLE "risk_copilot_suggestion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "status" "RiskCopilotStatus" NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "providerType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rawOutput" JSONB NOT NULL,
    "diagnostics" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_copilot_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_copilot_suggestion_item" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "riskCatalogId" TEXT NOT NULL,
    "severity" "RiskLevel" NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceQuote" TEXT NOT NULL,
    "mitigationIds" JSONB NOT NULL DEFAULT '[]',
    "decision" "ItemDecision" NOT NULL DEFAULT 'pending',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "risk_copilot_suggestion_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usecase_catalog_risk_link" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "riskCatalogId" TEXT NOT NULL,
    "severity" "RiskLevel" NOT NULL,
    "source" "RiskLinkSource" NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "acceptedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usecase_catalog_risk_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_copilot_suggestion_orgId_usecaseId_requestedAt_idx" ON "risk_copilot_suggestion"("orgId", "usecaseId", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "risk_copilot_suggestion_item_suggestionId_idx" ON "risk_copilot_suggestion_item"("suggestionId");

-- CreateIndex
CREATE INDEX "risk_copilot_suggestion_item_riskCatalogId_idx" ON "risk_copilot_suggestion_item"("riskCatalogId");

-- CreateIndex
CREATE INDEX "usecase_catalog_risk_link_orgId_usecaseId_idx" ON "usecase_catalog_risk_link"("orgId", "usecaseId");

-- CreateIndex
CREATE INDEX "usecase_catalog_risk_link_riskCatalogId_idx" ON "usecase_catalog_risk_link"("riskCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "usecase_catalog_risk_link_orgId_usecaseId_riskCatalogId_key" ON "usecase_catalog_risk_link"("orgId", "usecaseId", "riskCatalogId");

-- AddForeignKey
ALTER TABLE "risk_copilot_suggestion" ADD CONSTRAINT "risk_copilot_suggestion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_copilot_suggestion" ADD CONSTRAINT "risk_copilot_suggestion_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_copilot_suggestion" ADD CONSTRAINT "risk_copilot_suggestion_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_copilot_suggestion_item" ADD CONSTRAINT "risk_copilot_suggestion_item_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "risk_copilot_suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_copilot_suggestion_item" ADD CONSTRAINT "risk_copilot_suggestion_item_riskCatalogId_fkey" FOREIGN KEY ("riskCatalogId") REFERENCES "risk_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_copilot_suggestion_item" ADD CONSTRAINT "risk_copilot_suggestion_item_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_catalog_risk_link" ADD CONSTRAINT "usecase_catalog_risk_link_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_catalog_risk_link" ADD CONSTRAINT "usecase_catalog_risk_link_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_catalog_risk_link" ADD CONSTRAINT "usecase_catalog_risk_link_riskCatalogId_fkey" FOREIGN KEY ("riskCatalogId") REFERENCES "risk_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_catalog_risk_link" ADD CONSTRAINT "usecase_catalog_risk_link_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
