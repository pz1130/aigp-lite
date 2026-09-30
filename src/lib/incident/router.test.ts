import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";

let orgId: string;
let otherOrgId: string;
let userId: string;

function makeCtx(uid: string, oid: string): TRPCContext {
  return {
    session: {
      userId: uid,
      orgId: oid,
      role: "admin",
      email: `${uid}@x`,
    },
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `IncT ${Date.now()}` },
  });
  orgId = org.id;
  const o2 = await prisma.organization.create({
    data: { name: `IncT2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  const u = await prisma.user.create({
    data: { email: `u-${Date.now()}@x`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId, role: "admin" },
      { orgId: otherOrgId, userId, role: "admin" },
    ],
  });
});

afterAll(async () => {
  await prisma.incident.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
});

beforeEach(async () => {
  await prisma.incident.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
});

describe("incident.create", () => {
  it("writes slaDeadline = openedAt + 4h for severity=high (default)", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const before = Date.now();
    const rec = await caller.incident.create({ title: "T" });
    const after = Date.now();
    expect(rec.severity).toBe("high");
    const offset = rec.slaDeadline!.getTime() - rec.openedAt.getTime();
    expect(offset).toBe(4 * 60 * 60 * 1000);
    expect(rec.openedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(rec.openedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("writes slaDeadline = openedAt + 1h for severity=critical", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const rec = await caller.incident.create({
      title: "T",
      severity: "critical",
    });
    expect(rec.slaDeadline!.getTime() - rec.openedAt.getTime()).toBe(
      60 * 60 * 1000,
    );
  });

  it("auto-fills frameworkRefs.owaspAsi when category=hijack and no frameworkRefs given", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const rec = await caller.incident.create({
      title: "T",
      category: "hijack",
    });
    expect(rec.category).toBe("hijack");
    expect(rec.frameworkRefs).toEqual({ owaspAsi: ["ASI-01"] });
  });

  it("leaves frameworkRefs={} when category has no ASI mapping (audit_failure)", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const rec = await caller.incident.create({
      title: "T",
      category: "audit_failure",
    });
    expect(rec.frameworkRefs).toEqual({});
  });

  it("does NOT overwrite explicit frameworkRefs with category default", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const rec = await caller.incident.create({
      title: "T",
      category: "hijack",
      frameworkRefs: { owaspAsi: ["ASI-09"], owaspLlm: ["llm01-2025"] },
    });
    expect(rec.frameworkRefs).toEqual({
      owaspAsi: ["ASI-09"],
      owaspLlm: ["llm01-2025"],
    });
  });

  it("writes frameworkRefs={} when no category and no override", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const rec = await caller.incident.create({ title: "T" });
    expect(rec.category).toBeNull();
    expect(rec.frameworkRefs).toEqual({});
  });
});

describe("incident.updateClassification", () => {
  async function seed() {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    return caller.incident.create({ title: "X", category: "hijack" });
  }

  it("updates category and frameworkRefs independently", async () => {
    const created = await seed();
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const updated = await caller.incident.updateClassification({
      id: created.id,
      category: "data_leak",
      frameworkRefs: { owaspAsi: ["ASI-06"], owaspLlm: ["llm02-2025"] },
    });
    expect(updated.category).toBe("data_leak");
    expect(updated.frameworkRefs).toEqual({
      owaspAsi: ["ASI-06"],
      owaspLlm: ["llm02-2025"],
    });
  });

  it("category=null explicitly unclassifies", async () => {
    const created = await seed();
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const updated = await caller.incident.updateClassification({
      id: created.id,
      category: null,
    });
    expect(updated.category).toBeNull();
    // frameworkRefs untouched
    expect(updated.frameworkRefs).toEqual({ owaspAsi: ["ASI-01"] });
  });

  it("undefined fields leave existing values untouched", async () => {
    const created = await seed();
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const updated = await caller.incident.updateClassification({
      id: created.id,
    });
    expect(updated.category).toBe("hijack");
    expect(updated.frameworkRefs).toEqual({ owaspAsi: ["ASI-01"] });
  });

  it("rejects cross-org update with NOT_FOUND", async () => {
    const created = await seed();
    const callerOther = appRouter.createCaller(makeCtx(userId, otherOrgId));
    await expect(
      callerOther.incident.updateClassification({
        id: created.id,
        category: "data_leak",
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("writes an audit log entry capturing before/after", async () => {
    const created = await seed();
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.incident.updateClassification({
      id: created.id,
      category: "data_leak",
    });
    const audit = await prisma.auditLog.findFirst({
      where: { orgId, resourceId: created.id, action: "incident.reclassify" },
      orderBy: { ts: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.beforeJson as { category: string }).category).toBe("hijack");
    expect((audit?.afterJson as { category: string }).category).toBe(
      "data_leak",
    );
  });
});

describe("incident.updateSeverity", () => {
  async function seed(
    severity: "low" | "medium" | "high" | "critical" = "high",
  ) {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    return caller.incident.create({ title: "S", severity });
  }

  it("recomputes slaDeadline from original openedAt", async () => {
    const created = await seed("high");
    const originalOpenedAt = created.openedAt;
    await new Promise((r) => setTimeout(r, 50));
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const updated = await caller.incident.updateSeverity({
      id: created.id,
      severity: "critical",
    });
    expect(updated.severity).toBe("critical");
    expect(updated.openedAt.getTime()).toBe(originalOpenedAt.getTime());
    expect(updated.slaDeadline!.getTime() - originalOpenedAt.getTime()).toBe(
      60 * 60 * 1000,
    );
  });

  it("rejects cross-org update with NOT_FOUND", async () => {
    const created = await seed();
    const callerOther = appRouter.createCaller(makeCtx(userId, otherOrgId));
    await expect(
      callerOther.incident.updateSeverity({
        id: created.id,
        severity: "critical",
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("writes audit log capturing before/after severity + slaDeadline", async () => {
    const created = await seed("low");
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.incident.updateSeverity({
      id: created.id,
      severity: "critical",
    });
    const audit = await prisma.auditLog.findFirst({
      where: {
        orgId,
        resourceId: created.id,
        action: "incident.severity_change",
      },
      orderBy: { ts: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.beforeJson as { severity: string }).severity).toBe("low");
    expect((audit?.afterJson as { severity: string }).severity).toBe(
      "critical",
    );
    expect(audit?.beforeJson).toHaveProperty("slaDeadline");
    expect(audit?.afterJson).toHaveProperty("slaDeadline");
  });
});

describe("incident.list — category filter", () => {
  it("filters by category when provided", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.incident.create({ title: "A", category: "hijack" });
    await caller.incident.create({ title: "B", category: "data_leak" });
    await caller.incident.create({ title: "C" }); // no category

    const filtered = await caller.incident.list({ category: "hijack" });
    expect(filtered.map((r) => r.title)).toEqual(["A"]);

    const all = await caller.incident.list();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});

describe("incident.overdueCount", () => {
  async function seedWithDeadline(
    severity: "low" | "medium" | "high" | "critical",
    status: "open" | "investigating" | "mitigated" | "closed",
    slaDeadlineOffsetMs: number,
  ) {
    const created = await prisma.incident.create({
      data: {
        orgId,
        title: `O ${Math.random()}`,
        severity,
        status,
        openedById: userId,
        slaDeadline: new Date(Date.now() + slaDeadlineOffsetMs),
      },
    });
    return created;
  }

  it("counts open + investigating with slaDeadline in the past", async () => {
    await seedWithDeadline("high", "open", -3600_000); // 1h overdue
    await seedWithDeadline("high", "investigating", -100); // overdue
    await seedWithDeadline("high", "open", +3600_000); // future, not overdue
    await seedWithDeadline("medium", "mitigated", -3600_000); // mitigated, ignored
    await seedWithDeadline("low", "closed", -3600_000); // closed, ignored

    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(await caller.incident.overdueCount()).toBe(2);
  });

  it("ignores incidents with null slaDeadline", async () => {
    await prisma.incident.create({
      data: {
        orgId,
        title: "no-sla",
        severity: "high",
        status: "open",
        openedById: userId,
        slaDeadline: null,
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(await caller.incident.overdueCount()).toBe(0);
  });

  it("scopes by org", async () => {
    await prisma.incident.create({
      data: {
        orgId: otherOrgId,
        title: "other-org",
        severity: "high",
        status: "open",
        openedById: userId,
        slaDeadline: new Date(Date.now() - 3600_000),
      },
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(await caller.incident.overdueCount()).toBe(0);
  });
});
