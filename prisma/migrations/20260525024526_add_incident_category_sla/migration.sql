-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('hijack', 'capability_breach', 'data_leak', 'trust_failure', 'cascade', 'audit_failure', 'resource_abuse', 'bias_harm', 'policy_bypass');

-- AlterTable
ALTER TABLE "incident" ADD COLUMN     "category" "IncidentCategory",
ADD COLUMN     "frameworkRefs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "slaDeadline" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "incident_orgId_category_idx" ON "incident"("orgId", "category");

-- CreateIndex
CREATE INDEX "incident_orgId_slaDeadline_idx" ON "incident"("orgId", "slaDeadline");
