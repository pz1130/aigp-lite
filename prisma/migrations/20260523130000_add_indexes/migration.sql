-- LlmInvocation: add missing indexes for high-traffic queries
CREATE INDEX IF NOT EXISTS "llm_invocation_usecaseId_idx" ON "llm_invocation"("usecaseId");
CREATE INDEX IF NOT EXISTS "llm_invocation_apiKeyId_idx" ON "llm_invocation"("apiKeyId");
CREATE INDEX IF NOT EXISTS "llm_invocation_provider_model_idx" ON "llm_invocation"("provider", "model");
CREATE INDEX IF NOT EXISTS "llm_invocation_connectionId_idx" ON "llm_invocation"("connectionId");

-- PolicyEvaluation: add missing index on hit column (boolean filter)
CREATE INDEX IF NOT EXISTS "policy_evaluation_hit_idx" ON "policy_evaluation"("hit");

-- WorkflowInstance: add missing indexes
CREATE INDEX IF NOT EXISTS "workflow_instance_orgId_idx" ON "workflow_instance"("orgId");
CREATE INDEX IF NOT EXISTS "workflow_instance_state_idx" ON "workflow_instance"("state");
CREATE INDEX IF NOT EXISTS "workflow_instance_usecaseId_idx" ON "workflow_instance"("usecaseId");
CREATE INDEX IF NOT EXISTS "workflow_instance_templateId_idx" ON "workflow_instance"("templateId");

-- WorkflowStep: add missing indexes
CREATE INDEX IF NOT EXISTS "workflow_step_assigneeUserId_idx" ON "workflow_step"("assigneeUserId");
CREATE INDEX IF NOT EXISTS "workflow_step_decidedById_idx" ON "workflow_step"("decidedById");