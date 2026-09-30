-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'risk_officer', 'ai_owner', 'auditor', 'viewer');

-- CreateEnum
CREATE TYPE "Sensitivity" AS ENUM ('public', 'internal', 'confidential', 'restricted');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('first_party', 'third_party', 'public_dataset');

-- CreateEnum
CREATE TYPE "LinkDirection" AS ENUM ('training', 'inference_input', 'inference_output');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('slack_webhook', 'teams_webhook', 'servicenow');

-- CreateEnum
CREATE TYPE "BudgetScope" AS ENUM ('org', 'api_key', 'usecase');

-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'investigating', 'mitigated', 'closed');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('proposed', 'development', 'production', 'retired');

-- CreateEnum
CREATE TYPE "AutonomyLevel" AS ENUM ('assistant', 'simple_agent', 'collaborative_agent', 'agent_ecosystem');

-- CreateEnum
CREATE TYPE "DeploymentType" AS ENUM ('built', 'blended', 'embedded', 'byo');

-- CreateEnum
CREATE TYPE "Pillar" AS ENUM ('mandate_and_scope', 'structure_and_roles', 'processes', 'decision_rights', 'culture', 'communication');

-- CreateEnum
CREATE TYPE "PolicySeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "EnforcementMode" AS ENUM ('block', 'warn', 'log');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('input', 'output', 'both');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('openai', 'anthropic', 'azure_openai', 'google_gemini', 'openai_compatible', 'anthropic_compatible');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'aborted');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ControlStatus" AS ENUM ('not_applicable', 'not_started', 'in_progress', 'satisfied', 'failed');

-- CreateEnum
CREATE TYPE "ControlSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('open', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "StepDecision" AS ENUM ('pending', 'approved', 'rejected', 'requested_changes');

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'zh',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("orgId","userId")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sensitivity" "Sensitivity" NOT NULL DEFAULT 'internal',
    "origin" "DataOrigin" NOT NULL DEFAULT 'first_party',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usecase_data_link" (
    "usecaseId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "direction" "LinkDirection" NOT NULL DEFAULT 'training',

    CONSTRAINT "usecase_data_link_pkey" PRIMARY KEY ("usecaseId","dataSourceId","direction")
);

-- CreateTable
CREATE TABLE "enterprise_integration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "integrationType" "IntegrationType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentialsEncrypted" BYTEA NOT NULL,
    "subscribedEvents" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "healthStatus" TEXT,
    "lastDeliveryAt" TIMESTAMP(3),
    "inboundSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "enterprise_integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_log" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "eventType" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "externalRef" TEXT,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "errorMessage" TEXT,
    "payloadHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT,
    "controlId" TEXT,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scope" "BudgetScope" NOT NULL,
    "scopeRefId" TEXT,
    "period" "BudgetPeriod" NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "hardCap" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_alert" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'high',
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL DEFAULT '',
    "relatedUsecaseId" TEXT,
    "relatedPolicyEvaluationId" TEXT,
    "relatedLlmInvocationId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "external_refs" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '["usecase.approved","usecase.rejected"]',
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usecase" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "lifecycleStage" "LifecycleStage" NOT NULL DEFAULT 'proposed',
    "autonomyLevel" "AutonomyLevel" NOT NULL,
    "deploymentType" "DeploymentType" NOT NULL,
    "modelCardMd" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usecase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_version" (
    "id" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "modelCardMd" TEXT NOT NULL DEFAULT '',
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_maturity_assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "pillar" "Pillar" NOT NULL,
    "scoreInt" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "byUserId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_maturity_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ruleJson" JSONB NOT NULL,
    "severity" "PolicySeverity" NOT NULL,
    "enforcementMode" "EnforcementMode" NOT NULL,
    "scope" "PolicyScope" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_evaluation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "hit" BOOLEAN NOT NULL,
    "snippet" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_invocation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT,
    "apiKeyId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "policyHits" JSONB NOT NULL DEFAULT '[]',
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "cost_usd" DECIMAL(12,6),
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT,

    CONSTRAINT "llm_invocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "baseUrl" TEXT,
    "credentialsEncrypted" BYTEA NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastValidatedAt" TIMESTAMP(3),
    "lastValidationStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "provider_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptSourceIds" TEXT[],
    "totalPrompts" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "incidentId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_finding" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "promptRef" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "judgment" TEXT NOT NULL,
    "judgmentReason" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evaluation_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redteam_prompt_custom" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checker" TEXT NOT NULL,
    "expectedBehavior" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "redteam_prompt_custom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "pdfFileKey" TEXT,
    "excelFileKey" TEXT,
    "paramsJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_framework" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "risk_framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_control" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "ControlSeverity" NOT NULL DEFAULT 'medium',

    CONSTRAINT "risk_control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usecase_risk_assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "scoreInt" INTEGER NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "assessedById" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usecase_risk_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usecase_control_status" (
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "status" "ControlStatus" NOT NULL DEFAULT 'not_started',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usecase_control_status_pkey" PRIMARY KEY ("usecaseId","controlId")
);

-- CreateTable
CREATE TABLE "workflow_instance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "usecaseId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "state" "WorkflowState" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "assigneeRole" TEXT NOT NULL,
    "decidedById" TEXT,
    "decision" "StepDecision" NOT NULL DEFAULT 'pending',
    "comment" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "membership_userId_idx" ON "membership"("userId");

-- CreateIndex
CREATE INDEX "audit_log_orgId_ts_idx" ON "audit_log"("orgId", "ts" DESC);

-- CreateIndex
CREATE INDEX "audit_log_orgId_resourceType_resourceId_idx" ON "audit_log"("orgId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "data_source_orgId_sensitivity_idx" ON "data_source"("orgId", "sensitivity");

-- CreateIndex
CREATE UNIQUE INDEX "data_source_orgId_name_key" ON "data_source"("orgId", "name");

-- CreateIndex
CREATE INDEX "enterprise_integration_orgId_isActive_idx" ON "enterprise_integration"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_integration_orgId_name_key" ON "enterprise_integration"("orgId", "name");

-- CreateIndex
CREATE INDEX "integration_sync_log_integrationId_occurredAt_idx" ON "integration_sync_log"("integrationId", "occurredAt");

-- CreateIndex
CREATE INDEX "integration_sync_log_resourceType_resourceId_idx" ON "integration_sync_log"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "evidence_orgId_usecaseId_idx" ON "evidence"("orgId", "usecaseId");

-- CreateIndex
CREATE INDEX "evidence_orgId_controlId_idx" ON "evidence"("orgId", "controlId");

-- CreateIndex
CREATE INDEX "budget_orgId_isActive_idx" ON "budget"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "budget_alert_budgetId_periodKey_threshold_key" ON "budget_alert"("budgetId", "periodKey", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "incident_relatedPolicyEvaluationId_key" ON "incident"("relatedPolicyEvaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_relatedLlmInvocationId_key" ON "incident"("relatedLlmInvocationId");

-- CreateIndex
CREATE INDEX "incident_orgId_status_idx" ON "incident"("orgId", "status");

-- CreateIndex
CREATE INDEX "incident_orgId_severity_idx" ON "incident"("orgId", "severity");

-- CreateIndex
CREATE INDEX "webhook_endpoint_orgId_enabled_idx" ON "webhook_endpoint"("orgId", "enabled");

-- CreateIndex
CREATE INDEX "ai_usecase_orgId_lifecycleStage_idx" ON "ai_usecase"("orgId", "lifecycleStage");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usecase_orgId_name_key" ON "ai_usecase"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_version_usecaseId_version_key" ON "ai_model_version"("usecaseId", "version");

-- CreateIndex
CREATE INDEX "governance_maturity_assessment_orgId_pillar_ts_idx" ON "governance_maturity_assessment"("orgId", "pillar", "ts" DESC);

-- CreateIndex
CREATE INDEX "policy_orgId_enabled_idx" ON "policy"("orgId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "policy_orgId_name_key" ON "policy"("orgId", "name");

-- CreateIndex
CREATE INDEX "policy_evaluation_orgId_policyId_ts_idx" ON "policy_evaluation"("orgId", "policyId", "ts" DESC);

-- CreateIndex
CREATE INDEX "policy_evaluation_requestId_idx" ON "policy_evaluation"("requestId");

-- CreateIndex
CREATE INDEX "llm_invocation_orgId_ts_idx" ON "llm_invocation"("orgId", "ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_hash_key" ON "api_key"("hash");

-- CreateIndex
CREATE INDEX "api_key_orgId_idx" ON "api_key"("orgId");

-- CreateIndex
CREATE INDEX "provider_connection_orgId_isActive_idx" ON "provider_connection"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connection_orgId_name_key" ON "provider_connection"("orgId", "name");

-- CreateIndex
CREATE INDEX "evaluation_orgId_createdAt_idx" ON "evaluation"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "evaluation_finding_evaluationId_judgment_idx" ON "evaluation_finding"("evaluationId", "judgment");

-- CreateIndex
CREATE INDEX "redteam_prompt_custom_orgId_setName_idx" ON "redteam_prompt_custom"("orgId", "setName");

-- CreateIndex
CREATE UNIQUE INDEX "redteam_prompt_custom_orgId_setName_promptId_key" ON "redteam_prompt_custom"("orgId", "setName", "promptId");

-- CreateIndex
CREATE INDEX "report_orgId_generatedAt_idx" ON "report"("orgId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "risk_framework_code_key" ON "risk_framework"("code");

-- CreateIndex
CREATE UNIQUE INDEX "risk_control_frameworkId_code_key" ON "risk_control"("frameworkId", "code");

-- CreateIndex
CREATE INDEX "usecase_risk_assessment_orgId_usecaseId_assessedAt_idx" ON "usecase_risk_assessment"("orgId", "usecaseId", "assessedAt" DESC);

-- CreateIndex
CREATE INDEX "usecase_control_status_orgId_status_idx" ON "usecase_control_status"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_step_instanceId_stepIndex_key" ON "workflow_step"("instanceId", "stepIndex");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_data_link" ADD CONSTRAINT "usecase_data_link_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_data_link" ADD CONSTRAINT "usecase_data_link_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_integration" ADD CONSTRAINT "enterprise_integration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_log" ADD CONSTRAINT "integration_sync_log_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "enterprise_integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "risk_control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_alert" ADD CONSTRAINT "budget_alert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_relatedUsecaseId_fkey" FOREIGN KEY ("relatedUsecaseId") REFERENCES "ai_usecase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_relatedPolicyEvaluationId_fkey" FOREIGN KEY ("relatedPolicyEvaluationId") REFERENCES "policy_evaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_relatedLlmInvocationId_fkey" FOREIGN KEY ("relatedLlmInvocationId") REFERENCES "llm_invocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usecase" ADD CONSTRAINT "ai_usecase_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usecase" ADD CONSTRAINT "ai_usecase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_version" ADD CONSTRAINT "ai_model_version_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_maturity_assessment" ADD CONSTRAINT "governance_maturity_assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_maturity_assessment" ADD CONSTRAINT "governance_maturity_assessment_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy" ADD CONSTRAINT "policy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_evaluation" ADD CONSTRAINT "policy_evaluation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_evaluation" ADD CONSTRAINT "policy_evaluation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_invocation" ADD CONSTRAINT "llm_invocation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_invocation" ADD CONSTRAINT "llm_invocation_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_invocation" ADD CONSTRAINT "llm_invocation_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_key"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_invocation" ADD CONSTRAINT "llm_invocation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_finding" ADD CONSTRAINT "evaluation_finding_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redteam_prompt_custom" ADD CONSTRAINT "redteam_prompt_custom_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_control" ADD CONSTRAINT "risk_control_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "risk_framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_risk_assessment" ADD CONSTRAINT "usecase_risk_assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_risk_assessment" ADD CONSTRAINT "usecase_risk_assessment_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_risk_assessment" ADD CONSTRAINT "usecase_risk_assessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_control_status" ADD CONSTRAINT "usecase_control_status_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_control_status" ADD CONSTRAINT "usecase_control_status_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usecase_control_status" ADD CONSTRAINT "usecase_control_status_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "risk_control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_usecaseId_fkey" FOREIGN KEY ("usecaseId") REFERENCES "ai_usecase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

