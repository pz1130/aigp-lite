-- CreateEnum
CREATE TYPE "CrosswalkRelation" AS ENUM ('equivalent', 'related');

-- CreateTable
CREATE TABLE "control_crosswalk" (
    "id" TEXT NOT NULL,
    "sourceControlId" TEXT NOT NULL,
    "targetControlId" TEXT NOT NULL,
    "relation" "CrosswalkRelation" NOT NULL DEFAULT 'related',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_crosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "control_crosswalk_targetControlId_idx" ON "control_crosswalk"("targetControlId");

-- CreateIndex
CREATE UNIQUE INDEX "control_crosswalk_sourceControlId_targetControlId_key" ON "control_crosswalk"("sourceControlId", "targetControlId");

-- AddForeignKey
ALTER TABLE "control_crosswalk" ADD CONSTRAINT "control_crosswalk_sourceControlId_fkey" FOREIGN KEY ("sourceControlId") REFERENCES "risk_control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_crosswalk" ADD CONSTRAINT "control_crosswalk_targetControlId_fkey" FOREIGN KEY ("targetControlId") REFERENCES "risk_control"("id") ON DELETE CASCADE ON UPDATE CASCADE;
