import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { writeAudit } from "./log";
import { verifyChain, chainStats } from "./verify";

let orgId: string;
let otherOrgId: string;
let userId: string;

beforeAll(async () => {
  const o = await prisma.organization.create({
    data: { name: `V ${Date.now()}` },
  });
  orgId = o.id;
  const o2 = await prisma.organization.create({
    data: { name: `V2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  const u = await prisma.user.create({
    data: { email: `vf-${Date.now()}@x.test`, name: "VF", passwordHash: "x" },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
});

async function seedN(n: number, oid = orgId) {
  for (let i = 0; i < n; i++) {
    await writeAudit({
      orgId: oid,
      actorId: userId,
      action: "test.seed",
      resourceType: "t",
      resourceId: `r${i}`,
      after: { idx: i },
    });
  }
}

describe("verifyChain", () => {
  it("clean chain → ok", async () => {
    await seedN(5);
    const r = await verifyChain({ orgId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalChecked).toBe(5);
  });

  it("empty chain → ok with totalChecked=0", async () => {
    const r = await verifyChain({ orgId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalChecked).toBe(0);
  });

  it("tampered selfHash → firstBadKind=selfHash", async () => {
    await seedN(3);
    const target = await prisma.auditLog.findFirst({
      where: { orgId, seqNum: 2 },
    });
    await prisma.auditLog.update({
      where: { id: target!.id },
      data: { selfHash: "0".repeat(64) },
    });
    const r = await verifyChain({ orgId });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.firstBadSeq).toBe(2);
      expect(["selfHash", "prevHash"]).toContain(r.firstBadKind);
    }
  });

  it("tampered beforeJson → selfHash recompute mismatch", async () => {
    await seedN(3);
    const target = await prisma.auditLog.findFirst({
      where: { orgId, seqNum: 2 },
    });
    await prisma.auditLog.update({
      where: { id: target!.id },
      data: { beforeJson: { tampered: true } as Prisma.InputJsonObject },
    });
    const r = await verifyChain({ orgId });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.firstBadSeq).toBe(2);
      expect(r.firstBadKind).toBe("selfHash");
    }
  });

  it("deleted middle row → sequenceGap", async () => {
    await seedN(5);
    const target = await prisma.auditLog.findFirst({
      where: { orgId, seqNum: 3 },
    });
    await prisma.auditLog.delete({ where: { id: target!.id } });
    const r = await verifyChain({ orgId });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.firstBadSeq).toBe(3);
      expect(r.firstBadKind).toBe("sequenceGap");
    }
  });

  it("tampered prevHash → prevHash mismatch", async () => {
    await seedN(4);
    const target = await prisma.auditLog.findFirst({
      where: { orgId, seqNum: 3 },
    });
    await prisma.auditLog.update({
      where: { id: target!.id },
      data: { prevHash: "f".repeat(64) },
    });
    const r = await verifyChain({ orgId });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.firstBadSeq).toBe(3);
      expect(["prevHash", "selfHash"]).toContain(r.firstBadKind);
    }
  });

  it("range fromSeq=3 toSeq=5 walks boundary correctly with valid prior", async () => {
    await seedN(7);
    const r = await verifyChain({ orgId, fromSeq: 3, toSeq: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalChecked).toBe(3);
  });

  it("range starts at 3 detects break when row 2's selfHash was tampered (boundary check)", async () => {
    await seedN(7);
    const target = await prisma.auditLog.findFirst({
      where: { orgId, seqNum: 2 },
    });
    await prisma.auditLog.update({
      where: { id: target!.id },
      data: { selfHash: "0".repeat(64) },
    });
    const r = await verifyChain({ orgId, fromSeq: 3, toSeq: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.firstBadSeq).toBe(3);
  });

  it("orgId isolation: tampering in other org does not flag this org", async () => {
    await seedN(3);
    await seedN(2, otherOrgId);
    const targetB = await prisma.auditLog.findFirst({
      where: { orgId: otherOrgId, seqNum: 1 },
    });
    await prisma.auditLog.update({
      where: { id: targetB!.id },
      data: { selfHash: "0".repeat(64) },
    });
    const r = await verifyChain({ orgId });
    expect(r.ok).toBe(true);
  });
});

describe("chainStats", () => {
  it("returns null fields on empty org", async () => {
    const s = await chainStats(orgId);
    expect(s).toEqual({
      totalRows: 0,
      firstSeq: null,
      lastSeq: null,
      lastSelfHash: null,
      lastTs: null,
    });
  });

  it("returns head + tail summary after writes", async () => {
    await seedN(4);
    const s = await chainStats(orgId);
    expect(s.totalRows).toBe(4);
    expect(s.firstSeq).toBe(1);
    expect(s.lastSeq).toBe(4);
    expect(s.lastSelfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.lastTs).toBeInstanceOf(Date);
  });
});
