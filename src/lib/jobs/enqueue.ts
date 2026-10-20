import { getQueue } from "./queue";
import { JOB_OPTS } from "./config";
import type { JobName, JobPayload, JobPayloads } from "./types";

function jobIdFor<N extends JobName>(name: N, data: JobPayloads[N]): string {
  switch (name) {
    case "audit.forward":
      return `audit.forward__${(data as JobPayloads["audit.forward"]).auditLogId}`;
    case "worker.ping":
      return `worker.ping__${(data as JobPayloads["worker.ping"]).nonce}`;
    default:
      return String(name);
  }
}

export async function enqueueJob<N extends JobName>(
  name: N,
  data: JobPayload<N>,
): Promise<void> {
  const queue = await getQueue();
  if (queue) {
    await queue.add(name, data, { ...JOB_OPTS, jobId: jobIdFor(name, data) });
    return;
  }

  const { runProcessor } = await import("./processors");
  void runProcessor(name, data).catch((err) => {
    console.error(`[jobs] inline ${name} failed:`, err);
  });
}
