import {
  callLlm,
  hasOrgLlm,
  resolveLlm,
  type LlmCallResult,
} from "@/lib/ai/org-llm";
import type { ResponseFormat } from "@/lib/runtime/providers/types";
import { getAssistantProvider, isAssistantEnabled } from "./config";

export type { LlmCallResult };

/** Enabled when the operator env is configured or the org has its own LLM connection. */
export async function isAssistantEnabledForOrg(
  orgId: string,
): Promise<boolean> {
  return isAssistantEnabled() || (await hasOrgLlm(orgId));
}

function envAssistantProvider() {
  if (!isAssistantEnabled()) {
    throw new Error(
      "Policy assistant not configured: set AIGP_ASSISTANT_ENABLED or add an LLM provider connection",
    );
  }
  return getAssistantProvider();
}

export async function callAssistantLlm(
  orgId: string,
  systemPrompt: string,
  userMessage: string,
  responseFormat?: ResponseFormat,
): Promise<LlmCallResult> {
  const target = await resolveLlm(orgId, envAssistantProvider);
  return callLlm(target, systemPrompt, userMessage, responseFormat);
}
