import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { backfillOrg } from "./backfill-chain";
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
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { orgId } });
});

let seedCounter = 0;
async function seedRaw(opts: { ts: Date; action: string }) {
  seedCounter -= 1;
  // Use negative seqNum to avoid @@unique([orgId, seqNum]) conflict.
  // Backfill treats seqNum > 0 as already-filled; negatives get re-numbered.
  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO audit_log (id, "orgId", "actorId", action, "resourceType", "resourceId", ts, "seqNum")
     VALUES (gen_random_uuid(), $1, $2, $3, 'test', 'r1', $4, $5)
     RETURNING *`,
    orgId,
    userId,
    opts.action,
    opts.ts,
    seedCounter,
  );
  return row;
}

describe("backfillOrg", () => {
  it("fills seqNum/prevHash/selfHash on legacy rows in (ts, id) order", async () => {
    await seedRaw({
      ts: new Date("2026-01-01T10:00:00Z"),
      action: "a",
    });
    await seedRaw({
      ts: new Date("2026-01-01T11:00:00Z"),
      action: "b",
    });
    await seedRaw({
      ts: new Date("2026-01-01T12:00:00Z"),
      action: "c",
    });

    const filled = await backfillOrg(orgId);
    expect(filled).toBe(3);

    const rows = await prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { seqNum: "asc" },
    });
    expect(rows.map((r) => r.seqNum)).toEqual([1, 2, 3]);
    expect(rows[0].prevHash).toBeNull();
    expect(rows[1].prevHash).toBe(rows[0].selfHash);
    expect(rows[2].prevHash).toBe(rows[1].selfHash);

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
    await seedRaw({ ts: new Date("2026-01-01T10:00:00Z"), action: "a" });
    await seedRaw({ ts: new Date("2026-01-01T11:00:00Z"), action: "b" });

    const first = await backfillOrg(orgId);
    const second = await backfillOrg(orgId);
    expect(first).toBe(2);
    expect(second).toBe(0);
  });

  it("processes id tiebreaker when ts is identical", async () => {
    const sameTs = new Date("2026-01-01T10:00:00Z");
    await seedRaw({ ts: sameTs, action: "a" });
    await seedRaw({ ts: sameTs, action: "b" });

    await backfillOrg(orgId);
    const rows = await prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { seqNum: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].prevHash).toBe(rows[0].selfHash);
  });
});
