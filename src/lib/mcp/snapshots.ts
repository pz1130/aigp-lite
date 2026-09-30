import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import { McpEventBus } from "@/lib/events/mcp-bus";
import {
  normalizeTools,
  hashTools,
  diffSnapshots,
  type McpToolDescriptor,
  type SnapshotDiff,
} from "./drift";

export type RecordSnapshotResult =
  | { outcome: "baseline_created"; snapshotId: string }
  | { outcome: "matches_baseline" }
  | { outcome: "drift_detected"; snapshotId: string; diff: SnapshotDiff };

/**
 * Shared snapshot pipeline for both capture channels (daily poll + manual paste).
 * Normalizes, hashes, compares against the approved baseline, and on drift flags
 * the server pending_review + notifies + writes the audit chain.
 */
export async function recordSnapshot(opts: {
  serverId: string;
  orgId: string;
  tools: unknown;
  source: "polled" | "manual";
  capturedById?: string;
}): Promise<RecordSnapshotResult> {
  const normalized = normalizeTools(opts.tools);
  const hash = hashTools(normalized);

  const server = await prisma.mcpServer.findFirstOrThrow({
    where: { id: opts.serverId, orgId: opts.orgId },
    include: { baselineSnapshot: true },
  });

  if (server.baselineSnapshot && server.baselineSnapshot.toolsHash === hash) {
    return { outcome: "matches_baseline" };
  }

  const snapshot = await prisma.mcpToolSnapshot.create({
    data: {
      orgId: opts.orgId,
      serverId: opts.serverId,
      toolsHash: hash,
      toolsJson: normalized as object[],
      source: opts.source,
      capturedById: opts.capturedById ?? null,
    },
  });

  if (!server.baselineSnapshot) {
    await prisma.mcpServer.update({
      where: { id: server.id },
      data: { baselineSnapshotId: snapshot.id },
    });
    return { outcome: "baseline_created", snapshotId: snapshot.id };
  }

  const baselineTools = server.baselineSnapshot
    .toolsJson as unknown as McpToolDescriptor[];
  const diff = diffSnapshots(baselineTools, normalized);

  await prisma.mcpServer.update({
    where: { id: server.id },
    data: { driftStatus: "pending_review" },
  });

  await writeAudit({
    orgId: opts.orgId,
    actorId: opts.capturedById,
    action: "mcp.drift.detected",
    resourceType: "mcp_server",
    resourceId: server.id,
    before: { toolsHash: server.baselineSnapshot.toolsHash },
    after: { toolsHash: hash, source: opts.source },
  });

  McpEventBus.instance.emitDriftDetected({
    orgId: opts.orgId,
    serverId: server.id,
    serverName: server.name,
    snapshotId: snapshot.id,
    addedCount: diff.added.length,
    removedCount: diff.removed.length,
    changedCount: diff.changed.length,
  });

  return { outcome: "drift_detected", snapshotId: snapshot.id, diff };
}
