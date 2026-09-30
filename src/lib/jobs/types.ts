/** Stable job names for the single `aigp` queue. */
export type JobName =
  | "drift.run"
  | "alignment-audit.run"
  | "incident.maybe-open"
  | "incident.suggest-duplicates"
  | "audit.forward"
  | "webhook.deliver"
  | "redteam.moonshot.run"
  | "worker.ping"
  | "evidencePack.build"
  | "mcp.driftSweep";

/** Ids-only payloads. Processors refetch; nothing Prisma-shaped crosses Redis. */
export interface JobPayloads {
  "drift.run": { runId: string };
  "alignment-audit.run": { auditId: string };
  "incident.maybe-open": { evaluationId: string; usecaseId: string | null };
  "incident.suggest-duplicates": { incidentId: string };
  "audit.forward": { auditLogId: string };
  // Deliberately NOT ids-only: a webhook event isn't a persisted row, so the
  // small plain-JSON event travels with the job.
  "webhook.deliver": {
    orgId: string;
    event: string;
    data: Record<string, unknown>;
  };
  "redteam.moonshot.run": { evaluationId: string };
  // Trivial no-op job used by the worker smoke test to prove the worker boots,
  // connects, and drains a job end-to-end. The processor just records the nonce.
  "worker.ping": { nonce: string };
  "evidencePack.build": { packId: string };
  "mcp.driftSweep": Record<string, never>;
}

export type JobPayload<N extends JobName = JobName> = JobPayloads[N];
