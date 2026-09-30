-- CreateEnum
CREATE TYPE "TrustSnapshotStatus" AS ENUM ('draft', 'published', 'superseded', 'withdrawn');

-- CreateTable
CREATE TABLE "trust_profile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL,
    "intro" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_snapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER,
    "status" "TrustSnapshotStatus" NOT NULL DEFAULT 'draft',
    "publicPayload" JSONB NOT NULL DEFAULT '{}',
    "confidentialPayload" JSONB NOT NULL DEFAULT '{}',
    "includedUsecaseIds" TEXT[],
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_access_token" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trust_access_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trust_profile_orgId_key" ON "trust_profile"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "trust_profile_slug_key" ON "trust_profile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "trust_snapshot_supersededById_key" ON "trust_snapshot"("supersededById");

-- CreateIndex
CREATE INDEX "trust_snapshot_orgId_status_publishedAt_idx" ON "trust_snapshot"("orgId", "status", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "trust_snapshot_orgId_version_key" ON "trust_snapshot"("orgId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "trust_access_token_tokenHash_key" ON "trust_access_token"("tokenHash");

-- CreateIndex
CREATE INDEX "trust_access_token_orgId_revokedAt_idx" ON "trust_access_token"("orgId", "revokedAt");

-- AddForeignKey
ALTER TABLE "trust_profile" ADD CONSTRAINT "trust_profile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_snapshot" ADD CONSTRAINT "trust_snapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_snapshot" ADD CONSTRAINT "trust_snapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_snapshot" ADD CONSTRAINT "trust_snapshot_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_snapshot" ADD CONSTRAINT "trust_snapshot_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_snapshot" ADD CONSTRAINT "trust_snapshot_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "trust_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_access_token" ADD CONSTRAINT "trust_access_token_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_access_token" ADD CONSTRAINT "trust_access_token_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_access_token" ADD CONSTRAINT "trust_access_token_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
