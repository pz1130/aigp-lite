import { prisma } from "@/lib/db";
import type { EvalContext } from "./types";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { count } from "@/lib/observability/metrics";

/**
 * Persist policy evaluation hits by creating PolicyEvaluation rows and
 * firing maybeOpenIncident non-blocking for each hit.
 *
 * @param policies  The full PolicyDescriptor list used for evaluation (with id, orgId).
 * @param ctx       The evaluation context (must include org.id).
 * @param hits      The hits returned by the evaluate() function.
 * @param requestId A stable identifier for this request (e.g. LLM invocation id).
 * @param usecaseId Optional usecase id in scope.
 */
export async function persistEvaluations(
  policies: Array<{ id: string; orgId: string }>,
  ctx: EvalContext,
  hits: Array<{
    policyId: string;
    policyName: string;
    mode: string;
    scope: string;
    snippet: string;
    matchedFields: string[];
    severity: string;
  }>,
  requestId: string,
  usecaseId?: string | null,
): Promise<void> {
  if (!ctx.org?.id) return;

  for (const hit of hits) {
    const policyMeta = policies.find((p) => p.id === hit.policyId);
    const orgId = policyMeta?.orgId ?? ctx.org.id;

    const evaluation = await prisma.policyEvaluation.create({
      data: {
        orgId,
        policyId: hit.policyId,
        requestId,
        hit: true,
        snippet: hit.snippet,
      },
    });

    count("policy.evaluated", { hit: "true", severity: hit.severity });

    await enqueueJob("incident.maybe-open", {
      evaluationId: evaluation.id,
      usecaseId: usecaseId ?? null,
    });
  }
}
