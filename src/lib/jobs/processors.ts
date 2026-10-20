import { forwardAuditLogToSinks } from "@/lib/audit/log";
import { processWorkerPing } from "./processors/worker-ping";
import type { JobName, JobPayload, JobPayloads } from "./types";

type Handler<N extends JobName> = (data: JobPayloads[N]) => Promise<unknown>;

const HANDLERS: Partial<{ [N in JobName]: Handler<N> }> = {
  "audit.forward": ({ auditLogId }) => forwardAuditLogToSinks(auditLogId),
  "worker.ping": (d) => processWorkerPing(d),
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
