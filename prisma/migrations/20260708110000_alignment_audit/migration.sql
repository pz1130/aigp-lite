-- Alignment audit: catalog + runs + per-probe results (additive, idempotent).
CREATE TABLE IF NOT EXISTS "alignment_probe" (
  "id" TEXT NOT NULL,
  "dimension" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "promptText" TEXT NOT NULL,
  "expectedBehavior" TEXT NOT NULL,
  "concernGuidance" TEXT NOT NULL,
  "severityWeight" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alignment_probe_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "alignment_probe_dimension_idx" ON "alignment_probe"("dimension");

CREATE TABLE IF NOT EXISTS "alignment_audit" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "usecaseId" TEXT NOT NULL,
  "targetProvider" TEXT NOT NULL,
  "targetModel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "outcome" TEXT,
  "worstDimension" TEXT,
  "maxConcernScore" DOUBLE PRECISION,
  "concernThreshold" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
  "warnThreshold" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
  "completedCount" INTEGER NOT NULL DEFAULT 0,
  "totalCount" INTEGER NOT NULL,
  "escalatedIncidentId" TEXT,
  "startedById" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "alignment_audit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "alignment_audit_orgId_createdAt_idx" ON "alignment_audit"("orgId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "alignment_audit_orgId_usecaseId_status_idx" ON "alignment_audit"("orgId", "usecaseId", "status");

CREATE TABLE IF NOT EXISTS "alignment_result" (
  "id" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "probeId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "dimension" TEXT NOT NULL,
  "actualOutput" TEXT NOT NULL,
  "concernScore" DOUBLE PRECISION NOT NULL,
  "judgment" TEXT NOT NULL,
  "errored" BOOLEAN NOT NULL DEFAULT false,
  "targetLatencyMs" INTEGER,
  "targetTokens" INTEGER,
  "judgeLatencyMs" INTEGER,
  "judgeTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alignment_result_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "alignment_result_orgId_idx" ON "alignment_result"("orgId");
CREATE INDEX IF NOT EXISTS "alignment_result_auditId_idx" ON "alignment_result"("auditId");

DO $$ BEGIN
  ALTER TABLE "alignment_audit" ADD CONSTRAINT "alignment_audit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "alignment_audit" ADD CONSTRAINT "alignment_audit_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "alignment_audit" ADD CONSTRAINT "alignment_audit_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "alignment_result" ADD CONSTRAINT "alignment_result_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "alignment_audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "alignment_result" ADD CONSTRAINT "alignment_result_probeId_fkey" FOREIGN KEY ("probeId") REFERENCES "alignment_probe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "alignment_result" ADD CONSTRAINT "alignment_result_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;