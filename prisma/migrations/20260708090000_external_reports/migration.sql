-- AiUsecase public intake columns
ALTER TABLE "ai_usecase" ADD COLUMN IF NOT EXISTS "publicReportToken" TEXT;
ALTER TABLE "ai_usecase" ADD COLUMN IF NOT EXISTS "publicReportEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usecase_publicReportToken_key" ON "ai_usecase"("publicReportToken");

-- ExternalReport table
CREATE TABLE IF NOT EXISTS "external_report" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "usecaseId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reporterEmail" TEXT,
  "reproSteps" TEXT NOT NULL DEFAULT '',
  "reporterMeta" JSONB NOT NULL DEFAULT '{}',
  "embedding" JSONB,
  "citedProhibitedUseClause" TEXT NOT NULL DEFAULT '',
  "triageNotes" TEXT NOT NULL DEFAULT '',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "escalatedIncidentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "external_report_escalatedIncidentId_key" ON "external_report"("escalatedIncidentId");
CREATE INDEX IF NOT EXISTS "external_report_orgId_status_idx" ON "external_report"("orgId", "status");
CREATE INDEX IF NOT EXISTS "external_report_orgId_type_idx" ON "external_report"("orgId", "type");
CREATE INDEX IF NOT EXISTS "external_report_usecaseId_idx" ON "external_report"("usecaseId");

DO $$ BEGIN
  ALTER TABLE "external_report" ADD CONSTRAINT "external_report_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "external_report" ADD CONSTRAINT "external_report_usecaseId_fkey"
    FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "external_report" ADD CONSTRAINT "external_report_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "external_report" ADD CONSTRAINT "external_report_escalatedIncidentId_fkey"
    FOREIGN KEY ("escalatedIncidentId") REFERENCES "incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;