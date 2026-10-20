import { callLlm, resolveOrgLlm } from "@/lib/ai/org-llm";
import {
  EXTRACT_SYSTEM,
  buildExtractPrompt,
  parseExtraction,
  type RawControl,
} from "./prompt";

export { NoProviderError } from "@/lib/ai/org-llm";

export async function extractControlsFromText(
  orgId: string,
  text: string,
  frameworkName: string,
): Promise<RawControl[]> {
  const target = await resolveOrgLlm(orgId);
  const res = await callLlm(
    target,
    EXTRACT_SYSTEM,
    buildExtractPrompt(text, frameworkName),
  );
  return parseExtraction(res.rawText);
}
