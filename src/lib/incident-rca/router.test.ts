import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import * as orch from "./orchestrator";

process.env.INCIDENT_RCA_PROVIDER = "anthropic";
process.env.INCIDENT_RCA_API_KEY = "sk-x";
process.env.INCIDENT_RCA_MODEL = "claude-opus-4-7";

beforeEach(() => vi.restoreAllMocks());

async function ctxFor(role: "viewer" | "risk_officer" | "admin") {
  const org = await prisma.organization.create({
    data: { name: "RR-" + Date.now() },
  });
  const user = await prisma.user.create({
    data: { email: `rr-${Date.now()}@t.local`, name: "R", passwordHash: "x" },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role },
  });
  return {
    db: prisma,
    session: { orgId: org.id, userId: user.id, email: user.email, role },
    org,
    user,
  };
}

async function seedIncident(orgId: string, userId: string) {
  const incident = await prisma.incident.create({
    data: {
      orgId,
      title: "I-" + Date.now(),
      severity: "high",
      status: "open",
      openedById: userId,
    },
  });
  return incident;
}

describe("incidentRca router", () => {
  it("viewer cannot suggest", async () => {
    const ctx = await ctxFor("viewer");
    const inc = await seedIncident(ctx.org.id, ctx.user.id);
    const c = appRouter.createCaller(ctx);
    await expect(
      c.incidentRca.suggest({ incidentId: inc.id }),
    ).rejects.toThrow();
  });

  it("risk_officer suggest persists draft", async () => {
    const ctx = await ctxFor("risk_officer");
    const inc = await seedIncident(ctx.org.id, ctx.user.id);
    vi.spyOn(orch, "generateRca").mockResolvedValue({
      draftId: "d-1",
      status: "ok",
      retryCount: 0,
      summary: "valid summary text long enough to pass schema bound",
      rootCause: "valid root cause text long enough to pass schema bound",
      timeline: [],
      recommendations: [],
      diagnostics: [],
      providerType: "anthropic",
      model: "claude-opus-4-7",
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
    });
    const c = appRouter.createCaller(ctx);
    const r = await c.incidentRca.suggest({ incidentId: inc.id });
    expect(r.status).toBe("ok");
  });

  it("accept writes rootCause as markdown and sets acceptedAt", async () => {
    const ctx = await ctxFor("risk_officer");
    const inc = await seedIncident(ctx.org.id, ctx.user.id);
    const draft = await prisma.incidentRcaDraft.create({
      data: {
        orgId: ctx.org.id,
        incidentId: inc.id,
        requestedById: ctx.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        summary: "AI summary text.",
        rootCause: "AI root cause text.",
      },
    });
    const c = appRouter.createCaller(ctx);
    const r = await c.incidentRca.accept({ draftId: draft.id });
    expect(r.ok).toBe(true);
    const updated = await prisma.incident.findUnique({ where: { id: inc.id } });
    expect(updated!.rootCause).toContain("## Summary");
    expect(updated!.rootCause).toContain("AI summary text.");
    expect(updated!.rootCause).toContain("## Root Cause");

    const draftAfter = await prisma.incidentRcaDraft.findUnique({
      where: { id: draft.id },
    });
    expect(draftAfter!.acceptedAt).not.toBeNull();
  });

  it("accept preserves prior non-empty rootCause in '## Prior notes'", async () => {
    const ctx = await ctxFor("risk_officer");
    const inc = await prisma.incident.create({
      data: {
        orgId: ctx.org.id,
        title: "I",
        severity: "high",
        status: "open",
        openedById: ctx.user.id,
        rootCause: "manual prior notes",
      },
    });
    const draft = await prisma.incidentRcaDraft.create({
      data: {
        orgId: ctx.org.id,
        incidentId: inc.id,
        requestedById: ctx.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        summary: "AI summary text.",
        rootCause: "AI root cause text.",
      },
    });
    const c = appRouter.createCaller(ctx);
    const r = await c.incidentRca.accept({ draftId: draft.id });
    expect(r.overwroteExistingRootCause).toBe(true);
    const updated = await prisma.incident.findUnique({ where: { id: inc.id } });
    expect(updated!.rootCause).toContain("## Prior notes");
    expect(updated!.rootCause).toContain("manual prior notes");
  });

  it("accept is idempotent on already-accepted draft", async () => {
    const ctx = await ctxFor("risk_officer");
    const inc = await seedIncident(ctx.org.id, ctx.user.id);
    const draft = await prisma.incidentRcaDraft.create({
      data: {
        orgId: ctx.org.id,
        incidentId: inc.id,
        requestedById: ctx.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        summary: "x".repeat(40),
        rootCause: "y".repeat(40),
        acceptedById: ctx.user.id,
        acceptedAt: new Date(),
      },
    });
    const c = appRouter.createCaller(ctx);
    const r = await c.incidentRca.accept({ draftId: draft.id });
    expect(r.alreadyAccepted).toBe(true);
  });

  it("reject writes audit only; incident.rootCause unchanged", async () => {
    const ctx = await ctxFor("risk_officer");
    const inc = await seedIncident(ctx.org.id, ctx.user.id);
    const draft = await prisma.incidentRcaDraft.create({
      data: {
        orgId: ctx.org.id,
        incidentId: inc.id,
        requestedById: ctx.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        summary: "AI summary text.",
        rootCause: "AI root cause text.",
      },
    });
    const before = await prisma.incident.findUnique({ where: { id: inc.id } });
    const c = appRouter.createCaller(ctx);
    await c.incidentRca.reject({ draftId: draft.id });
    const after = await prisma.incident.findUnique({ where: { id: inc.id } });
    expect(after!.rootCause).toBe(before!.rootCause);
  });

  it("history returns drafts most recent first", async () => {
    const ctx = await ctxFor("risk_officer");
    const inc = await seedIncident(ctx.org.id, ctx.user.id);
    for (let i = 0; i < 3; i++) {
      await prisma.incidentRcaDraft.create({
        data: {
          orgId: ctx.org.id,
          incidentId: inc.id,
          requestedById: ctx.user.id,
          status: "ok",
          providerType: "anthropic",
          model: "claude-opus-4-7",
          rawOutput: {},
        },
      });
    }
    const c = appRouter.createCaller(ctx);
    const r = await c.incidentRca.history({ incidentId: inc.id, limit: 10 });
    expect(r.length).toBe(3);
    expect(new Date(r[0].requestedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(r[1].requestedAt).getTime(),
    );
  });
});
