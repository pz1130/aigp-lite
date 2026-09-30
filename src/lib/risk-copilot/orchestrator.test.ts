import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { suggestRisks } from "./orchestrator";
import * as llmClient from "./llm-client";

beforeEach(async () => {
  process.env.RISK_COPILOT_PROVIDER = "anthropic";
  process.env.RISK_COPILOT_API_KEY = "sk-test";
  process.env.RISK_COPILOT_MODEL = "claude-opus-4-7";
  process.env.RISK_COPILOT_DAILY_LIMIT = "20";
  delete process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET;
  vi.restoreAllMocks();
  await prisma.riskCopilotSuggestionItem.deleteMany({});
  await prisma.riskCopilotSuggestion.deleteMany({});
});

async function seedOrg() {
  const org = await prisma.organization.create({
    data: { name: "T-Org-" + Date.now() },
  });
  const user = await prisma.user.create({
    data: { email: `u-${Date.now()}@t.local`, name: "T", passwordHash: "x" },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: "risk_officer" },
  });
  const usecase = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      name: "Internal HR Bot " + Date.now(),
      ownerId: user.id,
      autonomyLevel: "assistant",
      deploymentType: "built",
      description:
        "A chatbot that stores user SSN in conversation memory for HR support tasks across departments.",
    },
  });
  const framework = await prisma.riskFramework.create({
    data: { code: "TEST-FW-" + Date.now(), name: "Test FW", version: "1.0" },
  });
  const risk = await prisma.riskCatalog.create({
    data: {
      source: "FINOS_AIGF",
      code: "FINOS-LLM-002",
      title: "PII leakage",
      summary: "Model stores PII.",
      description: "...",
    },
  });
  const control = await prisma.riskControl.create({
    data: {
      frameworkId: framework.id,
      code: "C1",
      title: "PII redaction",
      description: "...",
    },
  });
  await prisma.riskCatalogMitigation.create({
    data: { riskCatalogId: risk.id, controlId: control.id },
  });
  return { org, user, usecase, risk, control };
}

function mockLlmReturning(
  json: unknown,
  tokens = { input: 1200, output: 300 },
) {
  return vi.spyOn(llmClient, "callCopilotLlm").mockResolvedValue({
    rawText: JSON.stringify(json),
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    latencyMs: 1234,
    providerType: "anthropic",
    model: "claude-opus-4-7",
  });
}

describe("suggestRisks", () => {
  it("happy path returns status=ok and persists suggestion + 1 item", async () => {
    const { org, user, usecase, risk, control } = await seedOrg();
    mockLlmReturning({
      flag: "ok",
      suggestions: [
        {
          riskCode: risk.code,
          severity: "high",
          rationale:
            "The usecase stores user SSN which clearly violates the privacy control.",
          evidenceQuote: "stores user SSN in conversation memory",
          mitigationIds: [control.id],
        },
      ],
    });

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });

    expect(r.status).toBe("ok");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].riskCode).toBe(risk.code);

    const persisted = await prisma.riskCopilotSuggestion.findFirst({
      where: { id: r.suggestionId! },
      include: { items: true },
    });
    expect(persisted!.status).toBe("ok");
    expect(persisted?.items).toHaveLength(1);
    expect(persisted!.inputTokens).toBe(1200);
  });

  it("returns failed when description is too short", async () => {
    const { org, user, usecase } = await seedOrg();
    await prisma.aiUsecase.update({
      where: { id: usecase.id },
      data: { description: "tiny" },
    });

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });

    expect(r.status).toBe("failed");
    expect(r.errorMessage).toBe("description_too_short");
  });

  it("returns failed when catalog is empty", async () => {
    const { org, user, usecase } = await seedOrg();
    // Wipe ALL catalog data so the query returns 0 rows
    await prisma.riskCatalogMitigation.deleteMany({});
    await prisma.riskCopilotSuggestionItem.deleteMany({});
    await prisma.riskCatalog.deleteMany({});

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });

    expect(r.status).toBe("failed");
    expect(r.errorMessage).toBe("catalog_empty");
  });

  it("retries once when first attempt has unknown_risk_code, keeps better result", async () => {
    const { org, user, usecase, risk, control } = await seedOrg();
    const spy = vi
      .spyOn(llmClient, "callCopilotLlm")
      .mockResolvedValueOnce({
        rawText: JSON.stringify({
          flag: "ok",
          suggestions: [
            {
              riskCode: "BOGUS-X",
              severity: "high",
              rationale: "Some plausible rationale long enough to pass schema.",
              evidenceQuote: "stores user SSN in conversation memory",
              mitigationIds: [],
            },
            {
              riskCode: risk.code,
              severity: "medium",
              rationale:
                "Sensible rationale text long enough to pass schema length check.",
              evidenceQuote: "stores user SSN in conversation memory",
              mitigationIds: [control.id],
            },
          ],
        }),
        inputTokens: 1000,
        outputTokens: 200,
        latencyMs: 100,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      })
      .mockResolvedValueOnce({
        rawText: JSON.stringify({
          flag: "ok",
          suggestions: [
            {
              riskCode: risk.code,
              severity: "high",
              rationale:
                "Cleaned rationale that is long enough to pass schema length check.",
              evidenceQuote: "stores user SSN in conversation memory",
              mitigationIds: [control.id],
            },
          ],
        }),
        inputTokens: 800,
        outputTokens: 150,
        latencyMs: 80,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      });

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("ok");
    expect(r.retryCount).toBe(1);
    expect(r.items.every((it) => it.riskCode === risk.code)).toBe(true);

    const persisted = await prisma.riskCopilotSuggestion.findFirst({
      where: { id: r.suggestionId! },
    });
    expect(persisted!.inputTokens).toBe(1800); // sum across attempts
    expect(persisted!.retryCount).toBe(1);
  });

  it("returns failed when LLM throws", async () => {
    const { org, user, usecase } = await seedOrg();
    vi.spyOn(llmClient, "callCopilotLlm").mockRejectedValue(
      new Error("provider down"),
    );

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });

    expect(r.status).toBe("failed");
    expect(r.errorMessage).toContain("provider");
  });

  it("returns failed with schema_parse_failed when JSON is invalid", async () => {
    const { org, user, usecase } = await seedOrg();
    vi.spyOn(llmClient, "callCopilotLlm").mockResolvedValue({
      rawText: "not json at all",
      inputTokens: 50,
      outputTokens: 10,
      latencyMs: 5,
      providerType: "anthropic",
      model: "claude-opus-4-7",
    });

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });
    expect(r.status).toBe("failed");
    expect(
      r.diagnostics.find((d) => d.code === "schema_parse_failed"),
    ).toBeTruthy();
  });

  it("returns already_running for concurrent calls on same usecase", async () => {
    const { org, user, usecase, risk, control } = await seedOrg();
    vi.spyOn(llmClient, "callCopilotLlm").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return {
        rawText: JSON.stringify({
          flag: "ok",
          suggestions: [
            {
              riskCode: risk.code,
              severity: "high",
              rationale:
                "Rationale long enough to satisfy the schema constraint cleanly.",
              evidenceQuote: "stores user SSN in conversation memory",
              mitigationIds: [control.id],
            },
          ],
        }),
        inputTokens: 100,
        outputTokens: 20,
        latencyMs: 50,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      };
    });

    const [a, b] = await Promise.all([
      suggestRisks({ orgId: org.id, userId: user.id, usecaseId: usecase.id }),
      suggestRisks({ orgId: org.id, userId: user.id, usecaseId: usecase.id }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["failed", "ok"]);
    const failed = [a, b].find((x) => x.status === "failed")!;
    expect(failed.errorMessage).toBe("already_running");
  });

  it("fair-truncates across sources and reports per-source drops", async () => {
    const { org, user, usecase } = await seedOrg();
    // Replace the whole catalog with a controlled multi-source set.
    await prisma.riskCatalogMitigation.deleteMany({});
    await prisma.riskCopilotSuggestionItem.deleteMany({});
    await prisma.riskCatalog.deleteMany({});

    const sources = ["FINOS_AIGF", "OWASP_ASI", "NIST_AI_RMF"] as const;
    for (const s of sources) {
      for (let i = 0; i < 3; i++) {
        await prisma.riskCatalog.create({
          data: {
            source: s,
            code: `${s}-${i}`,
            title: `title ${s} ${i}`,
            summary: "s",
            description: "d",
          },
        });
      }
    }
    // Budget chosen to fit roughly one round (one row per source) but block
    // a second round. Rows are near-identical in size, so the round boundary
    // is well separated.
    process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET = "450";

    const spy = vi.spyOn(llmClient, "callCopilotLlm").mockResolvedValue({
      rawText: JSON.stringify({
        flag: "insufficient_info",
        reason: "n/a",
        suggestions: [],
      }),
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 1,
      providerType: "anthropic",
      model: "claude-opus-4-7",
    });

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });

    const sysPrompt = spy.mock.calls[0][0];
    for (const s of sources) {
      expect(sysPrompt).toContain(`${s}-0`); // first row of each source survives
    }

    const diag = r.diagnostics.find((d) => d.code === "catalog_truncated");
    expect(diag).toBeTruthy();
    expect(diag!.message).toContain("dropped");
    for (const s of sources) {
      expect(diag!.message).toContain(s);
    }
  });

  it("does not truncate the catalog under the default budget", async () => {
    const { org, user, usecase } = await seedOrg();
    delete process.env.RISK_COPILOT_CATALOG_TOKEN_BUDGET;

    mockLlmReturning({
      flag: "insufficient_info",
      reason: "n/a",
      suggestions: [],
    });

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });

    expect(
      r.diagnostics.find((d) => d.code === "catalog_truncated"),
    ).toBeUndefined();
  });
});
