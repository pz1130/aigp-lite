import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import * as orch from "./orchestrator";

process.env.INCIDENT_RCA_PROVIDER = "anthropic";
process.env.INCIDENT_RCA_API_KEY = "sk-x";
process.env.INCIDENT_RCA_MODEL = "claude-opus-4-7";

async function setup() {
  const org = await prisma.organization.create({
    data: { name: "AU-" + Date.now() },
  });
  const user = await prisma.user.create({
    data: { email: `au-${Date.now()}@t.local`, name: "A", passwordHash: "x" },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: "risk_officer" },
  });
  const incident = await prisma.incident.create({
    data: {
      orgId: org.id,
      title: "I",
      severity: "high",
      status: "open",
      openedById: user.id,
    },
  });
  return {
    org,
    user,
    incident,
    ctx: {
      db: prisma,
      session: {
        orgId: org.id,
        userId: user.id,
        email: user.email,
        role: "risk_officer" as const,
      },
    },
  };
}

beforeEach(() => vi.restoreAllMocks());

describe("incident-rca audit", () => {
  it("suggest writes incident_rca.suggest audit row", async () => {
    const f = await setup();
    vi.spyOn(orch, "generateRca").mockResolvedValue({
      draftId: "d",
      status: "ok",
      retryCount: 0,
      summary: "x".repeat(40),
      rootCause: "y".repeat(40),
      timeline: [],
      recommendations: [],
      diagnostics: [],
      providerType: "anthropic",
      model: "claude-opus-4-7",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    });
    await appRouter
      .createCaller(f.ctx)
      .incidentRca.suggest({ incidentId: f.incident.id });
    const row = await prisma.auditLog.findFirst({
      where: { orgId: f.org.id, action: "incident_rca.suggest" },
      orderBy: { ts: "desc" },
    });
    expect(row).toBeTruthy();
  });

  it("accept writes incident_rca.accept", async () => {
    const f = await setup();
    const draft = await prisma.incidentRcaDraft.create({
      data: {
        orgId: f.org.id,
        incidentId: f.incident.id,
        requestedById: f.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        summary: "x".repeat(40),
        rootCause: "y".repeat(40),
      },
    });
    await appRouter
      .createCaller(f.ctx)
      .incidentRca.accept({ draftId: draft.id });
    const row = await prisma.auditLog.findFirst({
      where: { orgId: f.org.id, action: "incident_rca.accept" },
    });
    expect(row).toBeTruthy();
  });

  it("reject writes incident_rca.reject", async () => {
    const f = await setup();
    const draft = await prisma.incidentRcaDraft.create({
      data: {
        orgId: f.org.id,
        incidentId: f.incident.id,
        requestedById: f.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
      },
    });
    await appRouter
      .createCaller(f.ctx)
      .incidentRca.reject({ draftId: draft.id });
    const row = await prisma.auditLog.findFirst({
      where: { orgId: f.org.id, action: "incident_rca.reject" },
    });
    expect(row).toBeTruthy();
  });
});
