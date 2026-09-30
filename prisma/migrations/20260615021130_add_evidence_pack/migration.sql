-- CreateEnum
CREATE TYPE "EvidencePackStatus" AS ENUM ('pending', 'building', 'ready', 'failed');

-- CreateTable
CREATE TABLE "evidence_pack" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT,
    "framework" TEXT,
    "storageKey" TEXT,
    "packHash" TEXT,
    "status" "EvidencePackStatus" NOT NULL DEFAULT 'pending',
    "snapshotRef" TEXT,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "evidence_pack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_pack_orgId_status_idx" ON "evidence_pack"("orgId", "status");

-- CreateIndex
CREATE INDEX "evidence_pack_orgId_usecaseId_idx" ON "evidence_pack"("orgId", "usecaseId");

-- AddForeignKey
ALTER TABLE "evidence_pack" ADD CONSTRAINT "evidence_pack_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_pack" ADD CONSTRAINT "evidence_pack_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_pack" ADD CONSTRAINT "evidence_pack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
