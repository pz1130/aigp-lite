import {
  callLlm,
  hasOrgLlm,
  resolveLlm,
  type LlmCallResult,
} from "@/lib/ai/org-llm";
import type { ResponseFormat } from "@/lib/runtime/providers/types";
import { getCopilotProvider, isCopilotEnabled } from "./config";

export type { LlmCallResult };

/** Enabled when the operator env is configured or the org has its own LLM connection. */
export async function isCopilotEnabledForOrg(orgId: string): Promise<boolean> {
  return isCopilotEnabled() || (await hasOrgLlm(orgId));
}

export async function callCopilotLlm(
  orgId: string,
  systemPrompt: string,
  userMessage: string,
  responseFormat?: ResponseFormat,
): Promise<LlmCallResult> {
  const target = await resolveLlm(orgId, getCopilotProvider);
  return callLlm(target, systemPrompt, userMessage, responseFormat);
}
