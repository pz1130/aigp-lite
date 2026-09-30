-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('model_provider', 'data_vendor', 'tooling_vendor');

-- CreateEnum
CREATE TYPE "VendorRiskRating" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "DueDiligenceStatus" AS ENUM ('yes', 'partial', 'no', 'not_applicable');

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendorType" "VendorType" NOT NULL,
    "description" TEXT,
    "providerConnectionId" TEXT,
    "computedRating" "VendorRiskRating",
    "ratingOverride" "VendorRiskRating",
    "overrideReason" TEXT,
    "assessedById" TEXT,
    "assessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_dd_answer" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "status" "DueDiligenceStatus" NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_dd_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_usecase_link" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_usecase_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_orgId_idx" ON "vendor"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_orgId_name_key" ON "vendor"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_dd_answer_vendorId_itemCode_key" ON "vendor_dd_answer"("vendorId", "itemCode");

-- CreateIndex
CREATE INDEX "vendor_usecase_link_orgId_idx" ON "vendor_usecase_link"("orgId");

-- CreateIndex
CREATE INDEX "vendor_usecase_link_usecaseId_idx" ON "vendor_usecase_link"("usecaseId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_usecase_link_vendorId_usecaseId_key" ON "vendor_usecase_link"("vendorId", "usecaseId");

-- AddForeignKey
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_providerConnectionId_fkey" FOREIGN KEY ("providerConnectionId") REFERENCES "provider_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_dd_answer" ADD CONSTRAINT "vendor_dd_answer_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_usecase_link" ADD CONSTRAINT "vendor_usecase_link_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_usecase_link" ADD CONSTRAINT "vendor_usecase_link_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_usecase_link" ADD CONSTRAINT "vendor_usecase_link_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
