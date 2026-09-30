// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import { PrismaClient } from "@/lib/prisma";
import { computeSelfHash, type HashableRow } from "@/lib/audit/hash";

const prisma = new PrismaClient();

export async function backfillOrg(orgId: string): Promise<number> {
  const unfilled = await prisma.auditLog.count({
    where: { orgId, seqNum: { lte: 0 } },
  });
  if (unfilled === 0) return 0;

  const rows = await prisma.auditLog.findMany({
    where: { orgId },
    orderBy: [{ ts: "asc" }, { id: "asc" }],
    select: {
      id: true,
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
      seqNum: true,
      prevHash: true,
      selfHash: true,
    },
  });

  let seq = 0;
  let prevHash: string | null = null;
  let filled = 0;
  for (const r of rows) {
    if (r.seqNum > 0) {
      seq = r.seqNum;
      prevHash = r.selfHash;
      continue;
    }
    seq += 1;
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
      seqNum: seq,
      prevHash,
    };
    const selfHash = computeSelfHash(hashable);
    await prisma.auditLog.update({
      where: { id: r.id },
      data: { seqNum: seq, prevHash, selfHash },
    });
    prevHash = selfHash;
    filled += 1;
  }
  return filled;
}

async function main(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let total = 0;
  for (const { id: orgId } of orgs) {
    const n = await backfillOrg(orgId);
    if (n > 0) console.log(`[backfill] org=${orgId} → filled ${n} rows`);
    total += n;
  }
  console.log(
    `[backfill] done. ${total} rows hashed across ${orgs.length} orgs.`,
  );
  await prisma.$disconnect();
}

// Only run main when invoked as CLI; importable for tests
if (require.main === module) {
  main().catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  });
}
