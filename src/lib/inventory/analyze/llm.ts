import { callLlm, resolveOrgLlm } from "@/lib/ai/org-llm";
import { SYSTEM, buildUserPrompt, type UsecaseInput } from "./prompt";

export { NoModelError, NoProviderError } from "@/lib/ai/org-llm";

export interface LlmResult {
  raw: string;
  modelProvider: string;
  modelName: string;
}

export async function callAnalysisLlm(
  orgId: string,
  usecase: UsecaseInput,
): Promise<LlmResult> {
  const target = await resolveOrgLlm(orgId);
  const res = await callLlm(
    target,
    SYSTEM,
    buildUserPrompt(usecase),
    undefined,
    {
      timeoutMs: 60_000,
    },
  );
  return {
    raw: res.rawText,
    modelProvider: res.providerType,
    modelName: res.model,
  };
}
