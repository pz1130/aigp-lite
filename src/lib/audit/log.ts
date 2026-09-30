import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/prisma";
import { computeSelfHash, type HashableRow } from "./hash";
import { forwardToSink, toForwardSink, type AuditPayload } from "./forward";
import { decryptJson } from "@/lib/crypto/secrets";
import { enqueueJob } from "@/lib/jobs/enqueue";

/**
 * Decrypt a sink's at-rest secrets blob into plaintext credentials.
 * Tolerates null/empty (sink created before secret re-entry) → returns {}.
 * Also tolerates a corrupt/undecryptable blob (e.g. after AIGP_ENCRYPTION_KEY
 * rotation or truncation): logs and degrades to no-credentials rather than
 * throwing, so one poisoned sink row can't break forwarding for the whole org.
 */
export function sinkSecrets(secretsEncrypted: Uint8Array | null | undefined): {
  token?: string;
  apiKey?: string;
} {
  if (!secretsEncrypted || secretsEncrypted.length === 0) return {};
  try {
    return decryptJson<{ token?: string; apiKey?: string }>(secretsEncrypted);
  } catch (err) {
    console.error(
      "[audit] failed to decrypt sink secrets; treating as no credentials",
      err,
    );
    return {};
  }
}

const SENSITIVE_PATTERN =
  /password|passwordHash|hash|secret|apiKey|api_key|csrf|nextauth_session/i;

function redact(input: unknown): unknown {
  if (input == null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = SENSITIVE_PATTERN.test(k) ? "[REDACTED]" : redact(v);
  }
  return out;
}

export interface AuditInput {
  orgId: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const ts = new Date();
  const beforeJson = input.before === undefined ? null : redact(input.before);
  const afterJson = input.after === undefined ? null : redact(input.after);

  const auditLogId = await prisma.$transaction(async (tx) => {
    // per-org advisory lock — auto-released on commit/rollback
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`audit-${input.orgId}`}))`;

    // read predecessor for this org
    const prev = await tx.auditLog.findFirst({
      where: { orgId: input.orgId },
      orderBy: { seqNum: "desc" },
      select: { seqNum: true, selfHash: true },
    });
    const seqNum = (prev?.seqNum ?? 0) + 1;
    const prevHash = prev?.selfHash ?? null;

    // compute selfHash over canonical content
    const hashable: HashableRow = {
      orgId: input.orgId,
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      beforeJson,
      afterJson,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      ts: ts.toISOString(),
      seqNum,
      prevHash,
    };
    const selfHash = computeSelfHash(hashable);

    // INSERT — ts written explicitly so it matches the hash input
    const created = await tx.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        beforeJson: beforeJson as Prisma.InputJsonValue,
        afterJson: afterJson as Prisma.InputJsonValue,
        ip: input.ip,
        userAgent: input.userAgent,
        ts,
        seqNum,
        prevHash,
        selfHash,
      },
    });
    return created.id;
  });

  // Enqueue supervised sink forwarding via BullMQ (falls back to inline when Redis is absent)
  await enqueueJob("audit.forward", { auditLogId });
}

/**
 * Re-fetches the AuditLog row by id and fans out to configured sinks (decrypts per Part A).
 * Safe to call with a non-existent auditLogId — returns early with no throw.
 */
export async function forwardAuditLogToSinks(
  auditLogId: string,
): Promise<void> {
  const row = await prisma.auditLog.findUnique({
    where: { id: auditLogId },
    select: {
      orgId: true,
      actorId: true,
      action: true,
      resourceType: true,
      resourceId: true,
      beforeJson: true,
      afterJson: true,
      ip: true,
      userAgent: true,
      ts: true,
    },
  });
  if (!row) return;

  await forwardToSinks(row.orgId, {
    ts: row.ts.toISOString(),
    orgId: row.orgId,
    actorId: row.actorId ?? undefined,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId ?? undefined,
    before: row.beforeJson as unknown,
    after: row.afterJson as unknown,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
  });
}

export async function forwardToSinks(
  orgId: string,
  payload: AuditPayload,
): Promise<void> {
  const sinks = await prisma.auditSink.findMany({
    where: { orgId, enabled: true },
  });
  if (sinks.length === 0) return;

  const redactedPayload: AuditPayload = {
    ...payload,
    before: payload.before ? redact(payload.before) : undefined,
    after: payload.after ? redact(payload.after) : undefined,
  };

  await Promise.allSettled(
    sinks.map((sink) => {
      const { token, apiKey } = sinkSecrets(sink.secretsEncrypted);
      const forwardSink = toForwardSink({
        type: sink.type,
        id: sink.id,
        url: sink.url,
        token,
        apiKey,
        host: sink.host,
        port: sink.port,
        protocol: sink.protocol,
      });
      if (!forwardSink) {
        console.error(`[audit-forward] invalid sink configuration ${sink.id}`);
        return Promise.resolve();
      }
      return forwardToSink(forwardSink, redactedPayload).catch((err) => {
        console.error(`[audit-forward] sink ${sink.id} (${sink.name}):`, err);
      });
    }),
  );
}
