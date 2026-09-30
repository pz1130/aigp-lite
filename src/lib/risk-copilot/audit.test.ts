import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import * as orch from "./orchestrator";

process.env.RISK_COPILOT_PROVIDER = "anthropic";
process.env.RISK_COPILOT_API_KEY = "sk-test";
process.env.RISK_COPILOT_MODEL = "claude-opus-4-7";

async function fixture() {
  const org = await prisma.organization.create({
    data: { name: "A-" + Date.now() },
  });
  const user = await prisma.user.create({
    data: { email: `a-${Date.now()}@t.local`, name: "A", passwordHash: "x" },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: "risk_officer" },
  });
  const usecase = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      ownerId: user.id,
      name: "AU-" + Date.now(),
      autonomyLevel: "assistant",
      deploymentType: "built",
      description:
        "stores user SSN in conversation memory for HR support tasks".padEnd(
          60,
          ".",
        ),
    },
  });
  const risk = await prisma.riskCatalog.create({
    data: {
      source: "FINOS_AIGF",
      code: "FINOS-X-" + Date.now(),
      title: "X",
      summary: "x",
      description: "x",
    },
  });
  const framework = await prisma.riskFramework.create({
    data: { code: "FW-A-" + Date.now(), name: "Test FW", version: "1.0" },
  });
  const control = await prisma.riskControl.create({
    data: {
      frameworkId: framework.id,
      code: "C-A-" + Date.now(),
      title: "Ctl",
      description: "x",
    },
  });
  await prisma.riskCatalogMitigation.create({
    data: { riskCatalogId: risk.id, controlId: control.id },
  });
  return { org, user, usecase, risk, control };
}

beforeEach(() => vi.restoreAllMocks());

describe("risk-copilot audit chain", () => {
  it("suggest writes audit row", async () => {
    const f = await fixture();
    vi.spyOn(orch, "suggestRisks").mockResolvedValue({
      suggestionId: "x",
      status: "ok",
      retryCount: 0,
      items: [],
      diagnostics: [],
      providerType: "anthropic",
      model: "claude-opus-4-7",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    });
    const ctx = {
      db: prisma,
      session: {
        orgId: f.org.id,
        userId: f.user.id,
        email: f.user.email,
        role: "risk_officer" as const,
      },
    };
    const before = await prisma.auditLog.count({ where: { orgId: f.org.id } });
    await appRouter
      .createCaller(ctx)
      .riskCopilot.suggest({ usecaseId: f.usecase.id });
    const after = await prisma.auditLog.findFirst({
      where: { orgId: f.org.id, action: "risk_copilot.suggest" },
      orderBy: { ts: "desc" },
    });
    expect(after).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { orgId: f.org.id } })).toBe(
      before + 1,
    );
  });

  it("decide(accepted) writes risk_copilot.accept", async () => {
    const f = await fixture();
    const sugg = await prisma.riskCopilotSuggestion.create({
      data: {
        orgId: f.org.id,
        usecaseId: f.usecase.id,
        requestedById: f.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        items: {
          create: [
            {
              riskCatalogId: f.risk.id,
              severity: "high",
              rationale:
                "rationale long enough to pass schema length checks here",
              evidenceQuote: "stores user SSN",
              mitigationIds: [f.control.id],
            },
          ],
        },
      },
      include: { items: true },
    });
    const ctx = {
      db: prisma,
      session: {
        orgId: f.org.id,
        userId: f.user.id,
        email: f.user.email,
        role: "risk_officer" as const,
      },
    };
    await appRouter
      .createCaller(ctx)
      .riskCopilot.decide({ itemId: sugg.items[0].id, decision: "accepted" });
    const row = await prisma.auditLog.findFirst({
      where: { orgId: f.org.id, action: "risk_copilot.accept" },
    });
    expect(row).toBeTruthy();
  });

  it("decide(rejected) writes risk_copilot.reject", async () => {
    const f = await fixture();
    const sugg = await prisma.riskCopilotSuggestion.create({
      data: {
        orgId: f.org.id,
        usecaseId: f.usecase.id,
        requestedById: f.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        items: {
          create: [
            {
              riskCatalogId: f.risk.id,
              severity: "high",
              rationale:
                "rationale long enough to pass schema length checks here",
              evidenceQuote: "stores user SSN",
              mitigationIds: [],
            },
          ],
        },
      },
      include: { items: true },
    });
    const ctx = {
      db: prisma,
      session: {
        orgId: f.org.id,
        userId: f.user.id,
        email: f.user.email,
        role: "risk_officer" as const,
      },
    };
    await appRouter
      .createCaller(ctx)
      .riskCopilot.decide({ itemId: sugg.items[0].id, decision: "rejected" });
    const row = await prisma.auditLog.findFirst({
      where: { orgId: f.org.id, action: "risk_copilot.reject" },
    });
    expect(row).toBeTruthy();
  });
});
