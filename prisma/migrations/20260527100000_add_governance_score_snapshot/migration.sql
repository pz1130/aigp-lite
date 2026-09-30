-- CreateTable
CREATE TABLE "governance_score_snapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "dimensions" JSONB NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_score_snapshot_orgId_ts_idx" ON "governance_score_snapshot"("orgId", "ts" DESC);

-- AddForeignKey
ALTER TABLE "governance_score_snapshot" ADD CONSTRAINT "governance_score_snapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
