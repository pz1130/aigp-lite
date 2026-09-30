import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { writeAudit } from "./log";

let orgId: string;
let userId: string;

beforeAll(async () => {
  await prisma.usecaseControlStatus.deleteMany();
  await prisma.usecaseRiskAssessment.deleteMany();
  await prisma.aiModelVersion.deleteMany();
  await prisma.aiUsecase.deleteMany();
  await prisma.governanceMaturityAssessment.deleteMany();
  await prisma.riskControl.deleteMany();
  await prisma.riskFramework.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.incidentTrendCluster.deleteMany();
  await prisma.incidentTrendReport.deleteMany();
  await prisma.usageInsightCluster.deleteMany();
  await prisma.usageInsightReport.deleteMany();
  await prisma.trustAccessToken.deleteMany();
  await prisma.trustSnapshot.deleteMany();
  await prisma.trustProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  const o = await prisma.organization.create({ data: { name: "AuditOrg" } });
  const u = await prisma.user.create({ data: { email: "x@y.z", name: "X" } });
  orgId = o.id;
  userId = u.id;
});

describe("writeAudit", () => {
  it("records an audit row with required fields", async () => {
    await writeAudit({
      orgId,
      actorId: userId,
      action: "usecase.create",
      resourceType: "ai_usecase",
      resourceId: "abc",
      after: { name: "demo" },
    });
    const rows = await prisma.auditLog.findMany({ where: { orgId } });
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe("usecase.create");
    expect(rows[0].afterJson).toEqual({ name: "demo" });
  });

  it("scrubs reserved sensitive keys from before/after diffs", async () => {
    await writeAudit({
      orgId,
      action: "user.update",
      resourceType: "user",
      resourceId: userId,
      before: { passwordHash: "secret", email: "a@b" },
      after: { passwordHash: "secret2", email: "a@b" },
    });
    const row = await prisma.auditLog.findFirst({
      where: { orgId, action: "user.update" },
      orderBy: { ts: "desc" },
    });
    expect((row!.beforeJson as { passwordHash: string }).passwordHash).toBe(
      "[REDACTED]",
    );
    expect((row!.afterJson as { passwordHash: string }).passwordHash).toBe(
      "[REDACTED]",
    );
    expect((row!.afterJson as { email: string }).email).toBe("a@b");
  });

  it("redacts nested sensitive keys in objects and arrays", async () => {
    await writeAudit({
      orgId,
      action: "test.nested",
      resourceType: "test",
      resourceId: "nested1",
      before: {
        user: {
          passwordHash: "nested-secret",
          name: "Alice",
        },
        groups: [{ name: "admins", secret: "group-secret" }, { name: "users" }],
      },
      after: {
        user: { passwordHash: "nested-secret2", name: "Alice" },
        groups: [
          { name: "admins", secret: "group-secret2" },
          { name: "users" },
        ],
        api_key: "sk-live-xxx",
      },
    });
    const row = await prisma.auditLog.findFirst({
      where: { orgId, action: "test.nested" },
      orderBy: { ts: "desc" },
    });
    const after = row!.afterJson as {
      user: { passwordHash: string; name: string };
      groups: Array<{ secret?: string; name: string }>;
      api_key: string;
    };
    expect(after.user.passwordHash).toBe("[REDACTED]");
    expect(after.user.name).toBe("Alice");
    expect(after.groups[0].secret).toBe("[REDACTED]");
    expect(after.groups[0].name).toBe("admins");
    expect(after.api_key).toBe("[REDACTED]");
  });
});

describe("writeAudit hash chain", () => {
  it("first row per org → seqNum=1, prevHash=null, selfHash non-null", async () => {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.first",
      resourceType: "thing",
      resourceId: "r1",
    });
    const row = await prisma.auditLog.findFirst({
      where: { orgId },
      orderBy: { seqNum: "desc" },
    });
    expect(row?.seqNum).toBe(1);
    expect(row?.prevHash).toBeNull();
    expect(row?.selfHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("second row → seqNum=2, prevHash=first.selfHash", async () => {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.a",
      resourceType: "t",
    });
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.b",
      resourceType: "t",
    });
    const rows = await prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { seqNum: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].seqNum).toBe(1);
    expect(rows[1].seqNum).toBe(2);
    expect(rows[1].prevHash).toBe(rows[0].selfHash);
  });

  it("selfHash matches computeSelfHash(hashable)", async () => {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await writeAudit({
      orgId,
      actorId: userId,
      action: "test.match",
      resourceType: "t",
      resourceId: "x",
      after: { foo: "bar" },
    });
    const row = await prisma.auditLog.findFirst({ where: { orgId } });
    expect(row).not.toBeNull();
    const { computeSelfHash } = await import("./hash");
    const expected = computeSelfHash({
      orgId: row!.orgId,
      actorId: row!.actorId,
      action: row!.action,
      resourceType: row!.resourceType,
      resourceId: row!.resourceId,
      beforeJson: row!.beforeJson,
      afterJson: row!.afterJson,
      ip: row!.ip,
      userAgent: row!.userAgent,
      ts: row!.ts.toISOString(),
      seqNum: row!.seqNum,
      prevHash: row!.prevHash,
    });
    expect(row!.selfHash).toBe(expected);
  });

  it("cross-org isolation: A's chain does not influence B's", async () => {
    const orgB = await prisma.organization.create({
      data: { name: `B ${Date.now()}` },
    });
    try {
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await writeAudit({
        orgId,
        actorId: userId,
        action: "test.a1",
        resourceType: "t",
      });
      await writeAudit({
        orgId,
        actorId: userId,
        action: "test.a2",
        resourceType: "t",
      });
      await writeAudit({
        orgId: orgB.id,
        actorId: userId,
        action: "test.b1",
        resourceType: "t",
      });
      const aRows = await prisma.auditLog.findMany({
        where: { orgId },
        orderBy: { seqNum: "asc" },
      });
      const bRows = await prisma.auditLog.findMany({
        where: { orgId: orgB.id },
        orderBy: { seqNum: "asc" },
      });
      expect(aRows.map((r) => r.seqNum)).toEqual([1, 2]);
      expect(bRows.map((r) => r.seqNum)).toEqual([1]); // B starts fresh
      expect(bRows[0].prevHash).toBeNull();
    } finally {
      await prisma.auditLog.deleteMany({ where: { orgId: orgB.id } });
      await prisma.organization.delete({ where: { id: orgB.id } });
    }
  });
});
