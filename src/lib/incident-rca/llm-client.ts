import {
  callLlm,
  hasOrgLlm,
  resolveLlm,
  type LlmCallResult,
} from "@/lib/ai/org-llm";
import type { ResponseFormat } from "@/lib/runtime/providers/types";
import { getRcaConfig, isRcaEnabled } from "./config";

export type { LlmCallResult };

/** Enabled when the operator env is configured or the org has its own LLM connection. */
export async function isRcaEnabledForOrg(orgId: string): Promise<boolean> {
  return isRcaEnabled() || (await hasOrgLlm(orgId));
}

export async function callRcaLlm(
  orgId: string,
  systemPrompt: string,
  userMessage: string,
  responseFormat?: ResponseFormat,
): Promise<LlmCallResult> {
  const target = await resolveLlm(orgId, getRcaConfig);
  return callLlm(target, systemPrompt, userMessage, responseFormat);
}
