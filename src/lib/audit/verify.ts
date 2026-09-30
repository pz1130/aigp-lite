import { prisma } from "@/lib/db";
import { computeSelfHash, type HashableRow } from "./hash";

export type VerifyResult =
  | { ok: true; totalChecked: number; fromSeq: number; toSeq: number }
  | {
      ok: false;
      totalChecked: number;
      firstBadSeq: number;
      firstBadKind: "selfHash" | "prevHash" | "sequenceGap" | "missingHash";
      detail: string;
    };

export async function verifyChain(args: {
  orgId: string;
  fromSeq?: number;
  toSeq?: number;
}): Promise<VerifyResult> {
  const seqFilter: Record<string, number> = {};
  if (args.fromSeq !== undefined) seqFilter.gte = args.fromSeq;
  if (args.toSeq !== undefined) seqFilter.lte = args.toSeq;

  const where = {
    orgId: args.orgId,
    ...(Object.keys(seqFilter).length > 0 ? { seqNum: seqFilter } : {}),
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { seqNum: "asc" },
  });
  if (rows.length === 0) {
    return { ok: true, totalChecked: 0, fromSeq: 0, toSeq: 0 };
  }

  let expectedSeq = rows[0].seqNum;
  let expectedPrev: string | null = null;
  if (expectedSeq > 1) {
    const priorRow = await prisma.auditLog.findFirst({
      where: { orgId: args.orgId, seqNum: expectedSeq - 1 },
      select: { selfHash: true },
    });
    expectedPrev = priorRow?.selfHash ?? null;
  }

  let checked = 0;
  for (const r of rows) {
    if (r.seqNum !== expectedSeq) {
      return {
        ok: false,
        totalChecked: checked,
        firstBadSeq: expectedSeq,
        firstBadKind: "sequenceGap",
        detail: `expected seq ${expectedSeq} but found ${r.seqNum}`,
      };
    }
    if (r.selfHash === null || (expectedSeq > 1 && r.prevHash === null)) {
      return {
        ok: false,
        totalChecked: checked,
        firstBadSeq: r.seqNum,
        firstBadKind: "missingHash",
        detail: `row seq ${r.seqNum} has null hash fields`,
      };
    }
    if ((r.prevHash ?? null) !== expectedPrev) {
      return {
        ok: false,
        totalChecked: checked,
        firstBadSeq: r.seqNum,
        firstBadKind: "prevHash",
        detail: `row seq ${r.seqNum} prevHash=${r.prevHash} expected=${expectedPrev}`,
      };
    }
    const hashable: HashableRow = {
      orgId: r.orgId,
      actorId: r.actorId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      beforeJson: r.beforeJson,
      afterJson: r.afterJson,
      ip: r.ip,
      userAgent: r.userAgent,
      ts: r.ts.toISOString(),
      seqNum: r.seqNum,
      prevHash: r.prevHash,
    };
    const recomputed = computeSelfHash(hashable);
    if (recomputed !== r.selfHash) {
      return {
        ok: false,
        totalChecked: checked,
        firstBadSeq: r.seqNum,
        firstBadKind: "selfHash",
        detail: `row seq ${r.seqNum} content does not match selfHash`,
      };
    }
    expectedPrev = r.selfHash;
    expectedSeq += 1;
    checked += 1;
  }

  return {
    ok: true,
    totalChecked: checked,
    fromSeq: rows[0].seqNum,
    toSeq: rows[rows.length - 1].seqNum,
  };
}

export async function chainStats(orgId: string): Promise<{
  totalRows: number;
  firstSeq: number | null;
  lastSeq: number | null;
  lastSelfHash: string | null;
  lastTs: Date | null;
}> {
  const first = await prisma.auditLog.findFirst({
    where: { orgId },
    orderBy: { seqNum: "asc" },
    select: { seqNum: true },
  });
  const last = await prisma.auditLog.findFirst({
    where: { orgId },
    orderBy: { seqNum: "desc" },
    select: { seqNum: true, selfHash: true, ts: true },
  });
  const totalRows = await prisma.auditLog.count({ where: { orgId } });
  return {
    totalRows,
    firstSeq: first?.seqNum ?? null,
    lastSeq: last?.seqNum ?? null,
    lastSelfHash: last?.selfHash ?? null,
    lastTs: last?.ts ?? null,
  };
}
