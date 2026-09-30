export type JudgeResult = {
  score: number;
  judgment: string;
  tokens: { input: number; output: number; latencyMs: number };
};

export function buildJudgePrompt(
  promptText: string,
  expectedBehavior: string,
  referenceOutput: string | null,
  actualOutput: string,
): string {
  const parts = [
    "You are a quality evaluator for AI model outputs.",
    "Rate the following AI output on a scale of 0-10.",
    "",
    "PROMPT GIVEN TO THE MODEL:",
    promptText,
    "",
    "EXPECTED BEHAVIOR:",
    expectedBehavior,
  ];
  if (referenceOutput) parts.push("", "REFERENCE OUTPUT:", referenceOutput);
  parts.push(
    "",
    "ACTUAL OUTPUT:",
    actualOutput,
    "",
    "Rate 0-10 based on correctness, completeness, and quality.",
    'Respond with ONLY a JSON object: {"score": <number>, "judgment": "<explanation>"}',
  );
  return parts.join("\n");
}

type LlmCallResult = {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  providerType: string;
  model: string;
};

type LlmCaller = (system: string, user: string) => Promise<LlmCallResult>;

export async function evaluateWithJudge(
  promptText: string,
  expectedBehavior: string,
  referenceOutput: string | null,
  actualOutput: string,
  callLlm: LlmCaller,
): Promise<JudgeResult> {
  const systemPrompt =
    "You are a strict quality evaluator. Respond only with JSON.";
  const userMessage = buildJudgePrompt(
    promptText,
    expectedBehavior,
    referenceOutput,
    actualOutput,
  );
  const llm = await callLlm(systemPrompt, userMessage);

  const json = extractJson(llm.rawText);
  if (!json || typeof json !== "object") {
    return {
      score: 0,
      judgment: "Failed to parse judge response",
      tokens: {
        input: llm.inputTokens,
        output: llm.outputTokens,
        latencyMs: llm.latencyMs,
      },
    };
  }
  const raw = (json as Record<string, unknown>).score;
  const score = typeof raw === "number" ? Math.max(0, Math.min(10, raw)) : 0;
  const rawJudgment = (json as Record<string, unknown>).judgment;
  const judgment =
    typeof rawJudgment === "string" ? rawJudgment : "No judgment provided";
  return {
    score,
    judgment,
    tokens: {
      input: llm.inputTokens,
      output: llm.outputTokens,
      latencyMs: llm.latencyMs,
    },
  };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const candidate = fenced ? fenced[1] : text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
