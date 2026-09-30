import { getQueue } from "./queue";
import { JOB_OPTS } from "./config";
import { metric } from "@/lib/incidents/metrics";
import type { JobName, JobPayload, JobPayloads } from "./types";

/**
 * Deterministic per-entity jobId so a double-enqueue dedupes in Redis.
 * NOTE: BullMQ forbids `:` in custom job ids (it reserves the colon for its own
 * Redis key namespacing and throws "Custom Ids cannot contain :"). Use `__` as
 * the field separator instead.
 */
function jobIdFor<N extends JobName>(name: N, data: JobPayloads[N]): string {
  switch (name) {
    case "drift.run":
      return `drift.run__${(data as JobPayloads["drift.run"]).runId}`;
    case "alignment-audit.run":
      return `alignment-audit.run__${(data as JobPayloads["alignment-audit.run"]).auditId}`;
    case "incident.maybe-open":
      return `incident.maybe-open__${(data as JobPayloads["incident.maybe-open"]).evaluationId}`;
    case "incident.suggest-duplicates":
      return `incident.suggest-duplicates__${(data as JobPayloads["incident.suggest-duplicates"]).incidentId}`;
    case "audit.forward":
      return `audit.forward__${(data as JobPayloads["audit.forward"]).auditLogId}`;
    case "webhook.deliver": {
      const d = data as JobPayloads["webhook.deliver"];
      return `webhook.deliver__${d.orgId}__${d.event}__${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    case "redteam.moonshot.run":
      return `redteam.moonshot.run__${(data as JobPayloads["redteam.moonshot.run"]).evaluationId}`;
    case "worker.ping":
      return `worker.ping__${(data as JobPayloads["worker.ping"]).nonce}`;
    case "evidencePack.build":
      return `evidencePack.build__${(data as JobPayloads["evidencePack.build"]).packId}`;
    case "mcp.driftSweep":
      return `mcp.driftSweep__${new Date().toISOString().slice(0, 10)}`;
    default:
      return String(name);
  }
}

/**
 * Enqueue a background job. With Redis configured the job lands on the `aigp`
 * queue for the worker; without Redis it runs inline, non-blocking — identical
 * semantics to the previous fire-and-forget `void` calls.
 */
export async function enqueueJob<N extends JobName>(
  name: N,
  data: JobPayload<N>,
): Promise<void> {
  const queue = await getQueue();
  if (queue) {
    await queue.add(name, data, { ...JOB_OPTS, jobId: jobIdFor(name, data) });
    metric("jobs.enqueued", { name });
    return;
  }

  // No Redis: run inline without blocking the caller. Dynamic import keeps the
  // enqueue -> processors edge out of the static graph (processors imports
  // auto-open, which imports this module).
  const { runProcessor } = await import("./processors");
  void runProcessor(name, data).catch((err) => {
    metric("jobs.inline_failed", { name });
    console.error(`[jobs] inline ${name} failed:`, err);
  });
}
