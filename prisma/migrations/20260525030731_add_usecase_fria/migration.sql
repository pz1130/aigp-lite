-- CreateEnum
CREATE TYPE "FriaStatus" AS ENUM ('draft', 'submitted', 'approved', 'archived');

-- CreateTable
CREATE TABLE "usecase_fria" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "FriaStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "sectionsJson" JSONB NOT NULL DEFAULT '{}',
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

    CONSTRAINT "usecase_fria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usecase_fria_supersededById_key" ON "usecase_fria"("supersededById");

-- CreateIndex
CREATE INDEX "usecase_fria_orgId_usecaseId_status_idx" ON "usecase_fria"("orgId", "usecaseId", "status");

-- CreateIndex
CREATE INDEX "usecase_fria_orgId_status_updatedAt_idx" ON "usecase_fria"("orgId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "usecase_fria_usecaseId_version_key" ON "usecase_fria"("usecaseId", "version");

-- AddForeignKey
ALTER TABLE "usecase_fria" ADD CONSTRAINT "usecase_fria_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fria" ADD CONSTRAINT "usecase_fria_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fria" ADD CONSTRAINT "usecase_fria_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fria" ADD CONSTRAINT "usecase_fria_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fria" ADD CONSTRAINT "usecase_fria_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fria" ADD CONSTRAINT "usecase_fria_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_fria" ADD CONSTRAINT "usecase_fria_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "usecase_fria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
