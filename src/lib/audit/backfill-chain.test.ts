import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { backfillOrg } from "../../../scripts/audit/backfill-chain";
import { computeSelfHash, type HashableRow } from "@/lib/audit/hash";

let orgId: string;
let userId: string;

beforeAll(async () => {
  const o = await prisma.organization.create({
    data: { name: `Backfill ${Date.now()}` },
  });
  orgId = o.id;
  const u = await prisma.user.create({
    data: { email: `bf-${Date.now()}@x.test`, name: "BF", passwordHash: "x" },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM audit_log WHERE "orgId" = ${orgId}`;
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM audit_log WHERE "orgId" = ${orgId}`;
});

/**
 * Insert legacy rows with seqNum=0 by temporarily dropping the unique index,
 * inserting, running backfill (which assigns unique seqNums), then recreating.
 */
async function seedLegacyRows(rows: { ts: Date; action: string }[]) {
  // Drop the unique constraint so we can insert multiple seqNum=0 rows
  await prisma.$executeRaw`DROP INDEX IF EXISTS "audit_log_orgId_seqNum_key"`;

  for (const r of rows) {
    const id = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.$executeRaw`
      INSERT INTO audit_log (id, "orgId", "actorId", action, "resourceType", "resourceId", ts, "seqNum")
      VALUES (${id}, ${orgId}, ${userId}, ${r.action}, 'test', 'r1', ${r.ts}, 0)
    `;
  }

  // Backfill assigns unique seqNums, making the data valid for the unique index
  await backfillOrg(orgId);

  // Now recreate the unique constraint — data is clean
  await prisma.$executeRaw`CREATE UNIQUE INDEX "audit_log_orgId_seqNum_key" ON "audit_log"("orgId", "seqNum")`;
}

describe("backfillOrg", () => {
  it("fills seqNum/prevHash/selfHash on legacy rows in (ts, id) order", async () => {
    await seedLegacyRows([
      { ts: new Date("2026-01-01T10:00:00Z"), action: "a" },
      { ts: new Date("2026-01-01T11:00:00Z"), action: "b" },
      { ts: new Date("2026-01-01T12:00:00Z"), action: "c" },
    ]);

    const rows = await prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { seqNum: "asc" },
    });
    expect(rows.map((r) => r.seqNum)).toEqual([1, 2, 3]);
    expect(rows[0].prevHash).toBeNull();
    expect(rows[1].prevHash).toBe(rows[0].selfHash);
    expect(rows[2].prevHash).toBe(rows[1].selfHash);

    // Each selfHash matches what computeSelfHash would produce
    const expected = computeSelfHash({
      orgId,
      actorId: userId,
      action: "a",
      resourceType: "test",
      resourceId: "r1",
      beforeJson: null,
      afterJson: null,
      ip: null,
      userAgent: null,
      ts: rows[0].ts.toISOString(),
      seqNum: 1,
      prevHash: null,
    } as HashableRow);
    expect(rows[0].selfHash).toBe(expected);
  });

  it("is idempotent — second run writes nothing", async () => {
    await seedLegacyRows([
      { ts: new Date("2026-01-01T10:00:00Z"), action: "a" },
      { ts: new Date("2026-01-01T11:00:00Z"), action: "b" },
    ]);

    // seedLegacyRows already ran backfill once; run again to verify idempotency
    const second = await backfillOrg(orgId);
    expect(second).toBe(0);

    // Verify rows are still correct
    const rows = await prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { seqNum: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.seqNum)).toEqual([1, 2]);
  });

  it("processes id tiebreaker when ts is identical", async () => {
    const sameTs = new Date("2026-01-01T10:00:00Z");
    await seedLegacyRows([
      { ts: sameTs, action: "a" },
      { ts: sameTs, action: "b" },
    ]);

    const rows = await prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { seqNum: "asc" },
    });
    expect(rows).toHaveLength(2);
    // Order is by id ascending — cuid is monotonic-ish so first-created is seqNum=1
    expect(rows[1].prevHash).toBe(rows[0].selfHash);
  });
});
