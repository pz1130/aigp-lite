import type { LlmOutput, Diagnostic } from "./schema";

export type PromptInput = {
  incident: {
    id: string;
    title: string;
    severity: string;
    status: string;
    category: string | null;
    frameworkRefs: Record<string, string[]>;
    openedAt: string;
    closedAt: string | null;
    rootCause: string;
  };
  usecase: {
    name: string;
    autonomyLevel: string;
    deploymentType: string;
    description: string;
  } | null;
  policyEvaluation: { hit: boolean; snippet: string } | null;
  llmInvocation: {
    provider: string;
    model: string;
    blocked: boolean;
    promptHash: string;
  } | null;
  auditTail: Array<{
    ts: string;
    action: string;
    actorEmail?: string | null;
    details?: unknown;
  }>;
  siblingIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    category: string | null;
    openedAt: string;
  }>;
};

const AUDIT_TAIL_CHAR_CAP = 4000;
const USECASE_DESC_CAP = 1200;
const INCIDENT_ROOT_CAP = 1500;
const POLICY_SNIPPET_CAP = 400;

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

function serialiseAudit(rows: PromptInput["auditTail"]): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.length <= AUDIT_TAIL_CHAR_CAP) return json;
  return json.slice(0, AUDIT_TAIL_CHAR_CAP) + "\n… [truncated]";
}

export function buildSystemPrompt(input: PromptInput): string {
  const i = input.incident;
  const parts: string[] = [
    `You are an AI incident root-cause analyst. Given the incident context
below, produce a structured JSON report.

Rules:
1. Be specific. Cite ids from the context (audit row index, sibling incident
   id, policy evaluation snippet excerpt) inline in rationale text.
2. Do NOT invent facts. If context is insufficient for a field, say so in
   summary and leave that block as an empty array.
3. timeline events must come from AUDIT TAIL or POLICY/LLM evidence — not
   speculation. Each entry has at (ISO 8601), event (<=140 chars), source
   in {audit, policy, llm, incident}.
4. recommendations are actionable: each has title (<=80), detail (<=400),
   priority in {low, medium, high}. At most 5.
5. summary <= 600 chars; rootCause <= 1200 chars.
6. Return strict JSON, no markdown, no preamble, no suffix.`,
    `\n=== INCIDENT ===
id: ${i.id}
title: ${i.title}
severity: ${i.severity}
status: ${i.status}
category: ${i.category ?? "none"}
frameworkRefs: ${JSON.stringify(i.frameworkRefs)}
openedAt: ${i.openedAt}
closedAt: ${i.closedAt ?? "open"}
priorRootCause (manual): ${truncate(i.rootCause, INCIDENT_ROOT_CAP)}`,
  ];

  if (input.usecase) {
    const u = input.usecase;
    parts.push(`\n=== USECASE ===
name: ${u.name}
autonomyLevel: ${u.autonomyLevel}
deploymentType: ${u.deploymentType}
description: ${truncate(u.description, USECASE_DESC_CAP)}`);
  }

  if (input.policyEvaluation) {
    const p = input.policyEvaluation;
    parts.push(`\n=== POLICY EVALUATION ===
hit: ${p.hit}
snippet: ${truncate(p.snippet, POLICY_SNIPPET_CAP)}`);
  }

  if (input.llmInvocation) {
    const l = input.llmInvocation;
    parts.push(`\n=== LLM INVOCATION ===
provider: ${l.provider}
model: ${l.model}
blocked: ${l.blocked}
promptHash: ${l.promptHash}`);
  }

  parts.push(`\n=== AUDIT TAIL ===
${serialiseAudit(input.auditTail)}`);

  if (input.usecase && input.siblingIncidents.length > 0) {
    parts.push(`\n=== SIBLING INCIDENTS ===
${JSON.stringify(input.siblingIncidents, null, 2)}`);
  }

  parts.push(`\n=== OUTPUT FORMAT ===
Return strict JSON matching this TypeScript type. No markdown, no preamble:
{
  "summary": string,            // 20..600 chars
  "rootCause": string,          // 20..1200 chars
  "timeline": Array<{ "at": ISO, "event": string, "source": "audit"|"policy"|"llm"|"incident" }>,
  "recommendations": Array<{ "title": string, "detail": string, "priority": "low"|"medium"|"high" }>
}`);

  return parts.join("\n");
}

export function buildRetryPrompt(
  prevSystem: string,
  _input: PromptInput,
  prevOutput: LlmOutput,
  diagnostics: Diagnostic[],
): string {
  const diagLines = diagnostics
    .map((d) => `- [${d.code}] ${d.message}`)
    .join("\n");
  return `${prevSystem}

=== RETRY ===
Your previous response had these issues. Fix each one in your next response:

${diagLines}

Previous output (truncated to 4000 chars):
${JSON.stringify(prevOutput).slice(0, 4000)}`;
}
