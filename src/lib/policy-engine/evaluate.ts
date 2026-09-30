import jsonLogic from "json-logic-js";
import type { EvalContext, Hit, PolicyDescriptor } from "./types";

// Register custom operators
jsonLogic.add_operation("regex_match", (a: unknown, b: unknown) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  try {
    return new RegExp(b).test(a);
  } catch {
    return false;
  }
});

jsonLogic.add_operation("length_gt", (a: unknown, b: unknown) => {
  if (typeof a !== "string") return false;
  if (typeof b !== "number") return false;
  return a.length > b;
});

jsonLogic.add_operation("contains_any", (a: unknown, b: unknown) => {
  if (typeof a !== "string" || !Array.isArray(b)) return false;
  const lowerA = a.toLowerCase();
  return b.some((term) => lowerA.includes(String(term).toLowerCase()));
});

const SNIPPET_MAX = 200;

export function evaluate(
  policies: PolicyDescriptor[],
  ctx: EvalContext,
): Hit[] {
  const hits: Hit[] = [];

  for (const policy of policies) {
    // Scope filter
    if (policy.scope !== "both" && policy.scope !== ctx.scope) continue;

    let matched = false;
    try {
      matched = Boolean(
        jsonLogic.apply(policy.ruleJson as jsonLogic.RulesLogic, ctx),
      );
    } catch {
      // Malformed rule — skip silently
      continue;
    }

    if (!matched) continue;

    const snippet =
      ctx.text.length > SNIPPET_MAX
        ? ctx.text.slice(0, SNIPPET_MAX) + "…"
        : ctx.text;

    hits.push({
      policyId: policy.id,
      policyName: policy.name,
      mode: policy.enforcementMode,
      scope: ctx.scope,
      snippet,
      matchedFields: ["text"],
      severity: policy.severity,
    });
  }

  return hits;
}
