import { runBenchmark } from "@/lib/drift/runner";
import { runAudit } from "@/lib/alignment-audit/runner";
import { forwardAuditLogToSinks } from "@/lib/audit/log";
import { maybeOpenIncidentByEvaluationId } from "@/lib/incidents/auto-open";
import { suggestDuplicates } from "@/lib/incidents/dedup";
import { deliverToOrg } from "@/lib/integrations/delivery";
import { processMoonshotRun } from "@/lib/redteam/moonshot/processor";
import { processWorkerPing } from "./processors/worker-ping";
import { processEvidencePackBuild } from "./processors/evidence-pack";
import { sweepMcpDrift } from "@/lib/mcp/poll";
import { prisma } from "@/lib/db";
import type { JobName, JobPayload, JobPayloads } from "./types";

type Handler<N extends JobName> = (data: JobPayloads[N]) => Promise<unknown>;

const HANDLERS: { [N in JobName]: Handler<N> } = {
  "drift.run": (d) => runBenchmark(d.runId),
  "alignment-audit.run": (d) => runAudit(d.auditId),
  "incident.maybe-open": (d) =>
    maybeOpenIncidentByEvaluationId(d.evaluationId, d.usecaseId),
  "incident.suggest-duplicates": (d) => suggestDuplicates(d.incidentId),
  "audit.forward": ({ auditLogId }) => forwardAuditLogToSinks(auditLogId),
  "redteam.moonshot.run": (d) =>
    processMoonshotRun({ evaluationId: d.evaluationId }, { db: prisma }),
  "worker.ping": (d) => processWorkerPing(d),
  "evidencePack.build": (d) => processEvidencePackBuild(d),
  "mcp.driftSweep": () => sweepMcpDrift(),
  "webhook.deliver": async ({ orgId, event, data }) => {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { orgId, enabled: true },
    });
    if (endpoints.length === 0) return;
    await deliverToOrg(
      endpoints.map((e) => ({
        id: e.id,
        url: e.url,
        secret: e.secret,
        events: e.events as unknown as string[],
        enabled: e.enabled,
      })),
      event,
      orgId,
      data,
    );
  },
};

export const JOB_NAMES = Object.keys(HANDLERS) as JobName[];

/** Run the processor for a job. Throws on unknown name (BullMQ will retry/fail it). */
export async function runProcessor<N extends JobName>(
  name: N,
  data: JobPayload<N>,
): Promise<void> {
  const handler = HANDLERS[name] as Handler<N> | undefined;
  if (!handler) throw new Error(`Unknown job: ${String(name)}`);
  await handler(data);
}
