import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import {
  startAudit,
  getAuditWithResults,
  escalateAudit,
  deleteAudit,
} from "./service";
import { MATRIX } from "@/lib/rbac/roles";

async function org(name: string) {
  const o = await prisma.organization.create({ data: { name } });
  const u = await prisma.user.create({
    data: { email: `${name}-${Math.random().toString(36).slice(2)}@x.com` },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: o.id,
      name: `uc-${name}`,
      ownerId: u.id,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  return { o, u, uc, db: withOrg(prisma, o.id) };
}

describe("alignment-audit RBAC matrix", () => {
  it("grants read to viewer and write/delete only to elevated roles", () => {
    expect(MATRIX.viewer.has("alignment-audit.read")).toBe(true);
    expect(MATRIX.viewer.has("alignment-audit.write")).toBe(false);
    expect(MATRIX.admin.has("alignment-audit.delete")).toBe(true);
    expect(MATRIX.risk_officer.has("alignment-audit.write")).toBe(true);
  });
});

describe("alignment-audit org isolation", () => {
  let a: Awaited<ReturnType<typeof org>>;
  let b: Awaited<ReturnType<typeof org>>;
  beforeEach(async () => {
    a = await org(`a${Math.random().toString(36).slice(2, 6)}`);
    b = await org(`b${Math.random().toString(36).slice(2, 6)}`);
    await prisma.alignmentProbe.upsert({
      where: { id: "seed-align-deception" },
      create: {
        id: "seed-align-deception",
        dimension: "deception",
        title: "t",
        promptText: "p",
        expectedBehavior: "e",
        concernGuidance: "c",
      },
      update: {},
    });
  });

  it("org B cannot read org A's audit", async () => {
    const { id } = await startAudit(a.db, {
      orgId: a.o.id,
      usecaseId: a.uc.id,
      targetProvider: "anthropic",
      targetModel: "m",
      startedById: a.u.id,
    });
    expect(await getAuditWithResults(b.db, id)).toBeNull();
    expect(await getAuditWithResults(a.db, id)).not.toBeNull();
  });

  it("start rejects a non-org-owned usecase", async () => {
    await expect(
      startAudit(a.db, {
        orgId: a.o.id,
        usecaseId: b.uc.id,
        targetProvider: "anthropic",
        targetModel: "m",
        startedById: a.u.id,
      }),
    ).rejects.toThrow(/usecase not found/);
  });

  it("escalate creates an incident, links it, and rejects double-escalation", async () => {
    const audit = await prisma.alignmentAudit.create({
      data: {
        orgId: a.o.id,
        usecaseId: a.uc.id,
        targetProvider: "anthropic",
        targetModel: "m",
        status: "completed",
        outcome: "fail",
        worstDimension: "deception",
        maxConcernScore: 9,
        totalCount: 1,
        startedById: a.u.id,
      },
    });
    const { incidentId } = await escalateAudit(a.db, {
      id: audit.id,
      orgId: a.o.id,
      userId: a.u.id,
    });
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });
    expect(incident?.orgId).toBe(a.o.id);
    expect(incident?.severity).toBe("high");
    await expect(
      escalateAudit(a.db, { id: audit.id, orgId: a.o.id, userId: a.u.id }),
    ).rejects.toThrow(/already escalated/);
  });

  it("delete removes the audit within the owning org only", async () => {
    const { id } = await startAudit(a.db, {
      orgId: a.o.id,
      usecaseId: a.uc.id,
      targetProvider: "anthropic",
      targetModel: "m",
      startedById: a.u.id,
    });
    await expect(deleteAudit(b.db, id)).rejects.toThrow(/not found/);
    await deleteAudit(a.db, id);
    expect(await getAuditWithResults(a.db, id)).toBeNull();
  });
});
