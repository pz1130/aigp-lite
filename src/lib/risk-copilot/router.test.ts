import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import * as orch from "./orchestrator";

process.env.RISK_COPILOT_PROVIDER = "anthropic";
process.env.RISK_COPILOT_API_KEY = "sk-test";
process.env.RISK_COPILOT_MODEL = "claude-opus-4-7";
process.env.RISK_COPILOT_DAILY_LIMIT = "20";

async function makeCtx(
  role: "viewer" | "risk_officer" | "admin" = "risk_officer",
) {
  const org = await prisma.organization.create({
    data: { name: "R-" + Date.now() },
  });
  const user = await prisma.user.create({
    data: { email: `r-${Date.now()}@t.local`, name: "R", passwordHash: "x" },
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

async function seedUsecaseAndCatalog(orgId: string, userId: string) {
  const usecase = await prisma.aiUsecase.create({
    data: {
      orgId,
      ownerId: userId,
      name: "UC-" + Date.now(),
      autonomyLevel: "assistant",
      deploymentType: "built",
      description:
        "stores user SSN in conversation memory for HR support".padEnd(50, "."),
    },
  });
  const risk = await prisma.riskCatalog.create({
    data: {
      source: "FINOS_AIGF",
      code: "FINOS-LLM-002-" + Date.now(),
      title: "PII leakage",
      summary: "x",
      description: "...",
    },
  });
  const framework = await prisma.riskFramework.create({
    data: { code: "FW-" + Date.now(), name: "Test FW", version: "1.0" },
  });
  const control = await prisma.riskControl.create({
    data: {
      frameworkId: framework.id,
      code: "C1-" + Date.now(),
      title: "Redact PII",
      description: "...",
    },
  });
  await prisma.riskCatalogMitigation.create({
    data: { riskCatalogId: risk.id, controlId: control.id },
  });
  return { usecase, risk, control };
}

beforeEach(() => vi.restoreAllMocks());

describe("riskCopilot router", () => {
  it("viewer cannot call suggest", async () => {
    const ctx = await makeCtx("viewer");
    const { usecase } = await seedUsecaseAndCatalog(ctx.org.id, ctx.user.id);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.riskCopilot.suggest({ usecaseId: usecase.id }),
    ).rejects.toThrow();
  });

  it("risk_officer suggest creates suggestion + items", async () => {
    const ctx = await makeCtx("risk_officer");
    const { usecase, risk, control } = await seedUsecaseAndCatalog(
      ctx.org.id,
      ctx.user.id,
    );
    vi.spyOn(orch, "suggestRisks").mockResolvedValue({
      suggestionId: "sg-1",
      status: "ok",
      retryCount: 0,
      items: [
        {
          riskCode: risk.code,
          severity: "high",
          rationale: "long enough rationale text passes schema length",
          evidenceQuote: "stores user SSN in conversation memory",
          mitigationIds: [control.id],
        },
      ],
      diagnostics: [],
      providerType: "anthropic",
      model: "claude-opus-4-7",
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
    });

    const caller = appRouter.createCaller(ctx);
    const r = await caller.riskCopilot.suggest({ usecaseId: usecase.id });
    expect(r.status).toBe("ok");
  });

  it("decide(accepted) creates UsecaseCatalogRiskLink + UsecaseControlStatus=not_started", async () => {
    const ctx = await makeCtx("risk_officer");
    const { usecase, risk, control } = await seedUsecaseAndCatalog(
      ctx.org.id,
      ctx.user.id,
    );
    const suggestion = await prisma.riskCopilotSuggestion.create({
      data: {
        orgId: ctx.org.id,
        usecaseId: usecase.id,
        requestedById: ctx.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        items: {
          create: [
            {
              riskCatalogId: risk.id,
              severity: "high",
              rationale: "long enough rationale text passes schema length",
              evidenceQuote: "stores user SSN",
              mitigationIds: [control.id],
            },
          ],
        },
      },
      include: { items: true },
    });

    const caller = appRouter.createCaller(ctx);
    const r = await caller.riskCopilot.decide({
      itemId: suggestion.items[0].id,
      decision: "accepted",
    });
    expect(r.ok).toBe(true);

    const link = await prisma.usecaseCatalogRiskLink.findFirst({
      where: { usecaseId: usecase.id, riskCatalogId: risk.id },
    });
    expect(link).toBeTruthy();
    expect(link!.source).toBe("ai");

    const cs = await prisma.usecaseControlStatus.findFirst({
      where: { usecaseId: usecase.id, controlId: control.id },
    });
    expect(cs!.status).toBe("not_started");
  });

  it("decide(accepted) is idempotent — returns alreadyLinked=true on repeat", async () => {
    const ctx = await makeCtx("risk_officer");
    const { usecase, risk, control } = await seedUsecaseAndCatalog(
      ctx.org.id,
      ctx.user.id,
    );
    const suggestion = await prisma.riskCopilotSuggestion.create({
      data: {
        orgId: ctx.org.id,
        usecaseId: usecase.id,
        requestedById: ctx.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        items: {
          create: [
            {
              riskCatalogId: risk.id,
              severity: "high",
              rationale: "long enough rationale text passes schema length",
              evidenceQuote: "stores user SSN",
              mitigationIds: [control.id],
            },
          ],
        },
      },
      include: { items: true },
    });
    const caller = appRouter.createCaller(ctx);
    await caller.riskCopilot.decide({
      itemId: suggestion.items[0].id,
      decision: "accepted",
    });

    const second = await prisma.riskCopilotSuggestionItem.create({
      data: {
        suggestionId: suggestion.id,
        riskCatalogId: risk.id,
        severity: "high",
        rationale: "another rationale long enough to pass schema length checks",
        evidenceQuote: "stores user SSN",
        mitigationIds: [control.id],
      },
    });
    const r = await caller.riskCopilot.decide({
      itemId: second.id,
      decision: "accepted",
    });
    expect(r.alreadyLinked).toBe(true);
  });

  it("decide(rejected) updates item only, writes nothing to business tables", async () => {
    const ctx = await makeCtx("risk_officer");
    const { usecase, risk, control } = await seedUsecaseAndCatalog(
      ctx.org.id,
      ctx.user.id,
    );
    const suggestion = await prisma.riskCopilotSuggestion.create({
      data: {
        orgId: ctx.org.id,
        usecaseId: usecase.id,
        requestedById: ctx.user.id,
        status: "ok",
        providerType: "anthropic",
        model: "claude-opus-4-7",
        rawOutput: {},
        items: {
          create: [
            {
              riskCatalogId: risk.id,
              severity: "high",
              rationale:
                "rejected rationale that is long enough to pass schema length checks",
              evidenceQuote: "stores user SSN",
              mitigationIds: [control.id],
            },
          ],
        },
      },
      include: { items: true },
    });
    const caller = appRouter.createCaller(ctx);
    await caller.riskCopilot.decide({
      itemId: suggestion.items[0].id,
      decision: "rejected",
    });

    const link = await prisma.usecaseCatalogRiskLink.findFirst({
      where: { usecaseId: usecase.id },
    });
    expect(link).toBeNull();
    const cs = await prisma.usecaseControlStatus.findFirst({
      where: { usecaseId: usecase.id },
    });
    expect(cs).toBeNull();
    const itemAfter = await prisma.riskCopilotSuggestionItem.findUnique({
      where: { id: suggestion.items[0].id },
    });
    expect(itemAfter!.decision).toBe("rejected");
  });

  it("usageToday returns today count and limit", async () => {
    const ctx = await makeCtx("risk_officer");
    const caller = appRouter.createCaller(ctx);
    const r = await caller.riskCopilot.usageToday();
    expect(r.used).toBe(0);
    expect(r.limit).toBe(20);
  });
});
