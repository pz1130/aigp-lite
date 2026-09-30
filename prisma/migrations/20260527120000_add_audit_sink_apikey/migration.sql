-- AlterEnum: add 'datadog' to AuditSinkType
ALTER TYPE "AuditSinkType" ADD VALUE 'datadog';

-- AlterTable: add apiKey column
ALTER TABLE "audit_sink" ADD COLUMN "apiKey" TEXT;
