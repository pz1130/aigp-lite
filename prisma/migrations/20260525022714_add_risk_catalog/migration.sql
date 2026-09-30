-- CreateEnum
CREATE TYPE "RiskCatalogSource" AS ENUM ('FINOS_AIGF', 'custom');

-- AlterTable
ALTER TABLE "risk_control" ADD COLUMN     "frameworkRefs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "risk_catalog" (
    "id" TEXT NOT NULL,
    "source" "RiskCatalogSource" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frameworkRefs" JSONB NOT NULL DEFAULT '{}',
    "relatedRiskCodes" JSONB NOT NULL DEFAULT '[]',
    "orgId" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_catalog_mitigation" (
    "riskCatalogId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,

    CONSTRAINT "risk_catalog_mitigation_pkey" PRIMARY KEY ("riskCatalogId","controlId")
);

-- CreateIndex
CREATE INDEX "risk_catalog_source_idx" ON "risk_catalog"("source");

-- CreateIndex
CREATE INDEX "risk_catalog_orgId_idx" ON "risk_catalog"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_catalog_source_code_orgId_key" ON "risk_catalog"("source", "code", "orgId");

-- CreateIndex
CREATE INDEX "risk_catalog_mitigation_controlId_idx" ON "risk_catalog_mitigation"("controlId");

-- AddForeignKey
ALTER TABLE "risk_catalog" ADD CONSTRAINT "risk_catalog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_catalog_mitigation" ADD CONSTRAINT "risk_catalog_mitigation_riskCatalogId_fkey" FOREIGN KEY ("riskCatalogId") REFERENCES "risk_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_catalog_mitigation" ADD CONSTRAINT "risk_catalog_mitigation_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "risk_control"("id") ON DELETE CASCADE ON UPDATE CASCADE;
