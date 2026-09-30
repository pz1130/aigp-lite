import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { suggestRisks } from "./orchestrator";
import * as llmClient from "./llm-client";

process.env.RISK_COPILOT_PROVIDER = "anthropic";
process.env.RISK_COPILOT_API_KEY = "sk-test";
process.env.RISK_COPILOT_MODEL = "claude-opus-4-7";

beforeEach(() => vi.restoreAllMocks());

describe("risk-copilot usage tracking", () => {
  it("aggregates tokens + latency across retry on the suggestion row", async () => {
    const org = await prisma.organization.create({
      data: { name: "U-" + Date.now() },
    });
    const user = await prisma.user.create({
      data: { email: `u-${Date.now()}@t.local`, name: "U", passwordHash: "x" },
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, role: "risk_officer" },
    });
    const usecase = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        ownerId: user.id,
        name: "U-" + Date.now(),
        autonomyLevel: "assistant",
        deploymentType: "built",
        description:
          "stores user SSN in conversation memory for HR tasks".padEnd(60, "."),
      },
    });
    const risk = await prisma.riskCatalog.create({
      data: {
        source: "FINOS_AIGF",
        code: "FX-" + Date.now(),
        title: "X",
        summary: "s",
        description: "d",
      },
    });

    let call = 0;
    vi.spyOn(llmClient, "callCopilotLlm").mockImplementation(async () => {
      call++;
      const known = risk.code;
      const items =
        call === 1
          ? [
              {
                riskCode: "BOGUS",
                severity: "high" as const,
                rationale:
                  "rationale long enough to pass schema checks for this attempt 1",
                evidenceQuote: "stores user SSN in conversation memory",
                mitigationIds: [],
              },
              {
                riskCode: known,
                severity: "low" as const,
                rationale:
                  "rationale long enough to pass schema checks for this attempt 1",
                evidenceQuote: "stores user SSN in conversation memory",
                mitigationIds: [],
              },
            ]
          : [
              {
                riskCode: known,
                severity: "high" as const,
                rationale:
                  "rationale long enough to pass schema checks for the second attempt",
                evidenceQuote: "stores user SSN in conversation memory",
                mitigationIds: [],
              },
            ];
      return {
        rawText: JSON.stringify({ flag: "ok", suggestions: items }),
        inputTokens: 100 * call,
        outputTokens: 50 * call,
        latencyMs: 200 * call,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      };
    });

    const r = await suggestRisks({
      orgId: org.id,
      userId: user.id,
      usecaseId: usecase.id,
    });
    expect(r.retryCount).toBe(1);

    const persisted = await prisma.riskCopilotSuggestion.findUnique({
      where: { id: r.suggestionId! },
    });
    expect(persisted!.inputTokens).toBe(300); // 100 + 200
    expect(persisted!.outputTokens).toBe(150); // 50 + 100
    expect(persisted!.latencyMs).toBe(600); // 200 + 400
    expect(persisted!.retryCount).toBe(1);
  });

  it("usageToday counts today's suggestions for the org", async () => {
    const org = await prisma.organization.create({
      data: { name: "UU-" + Date.now() },
    });
    const user = await prisma.user.create({
      data: {
        email: `uu-${Date.now()}@t.local`,
        name: "UU",
        passwordHash: "x",
      },
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, role: "risk_officer" },
    });
    const usecase = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        ownerId: user.id,
        name: "UU-" + Date.now(),
        autonomyLevel: "assistant",
        deploymentType: "built",
        description: "x".repeat(60),
      },
    });

    for (let i = 0; i < 3; i++) {
      await prisma.riskCopilotSuggestion.create({
        data: {
          orgId: org.id,
          usecaseId: usecase.id,
          requestedById: user.id,
          status: "failed",
          providerType: "x",
          model: "x",
          rawOutput: {},
        },
      });
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const count = await prisma.riskCopilotSuggestion.count({
      where: { orgId: org.id, requestedAt: { gte: start } },
    });
    expect(count).toBe(3);
  });
});
