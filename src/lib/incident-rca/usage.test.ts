import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRca } from "./orchestrator";
import * as llm from "./llm-client";

process.env.INCIDENT_RCA_PROVIDER = "anthropic";
process.env.INCIDENT_RCA_API_KEY = "sk-x";
process.env.INCIDENT_RCA_MODEL = "claude-opus-4-7";

beforeEach(() => vi.restoreAllMocks());

describe("incident-rca usage", () => {
  it("aggregates input/output tokens + latency across retry", async () => {
    const org = await prisma.organization.create({
      data: { name: "U-" + Date.now() },
    });
    const user = await prisma.user.create({
      data: { email: `u-${Date.now()}@t.local`, name: "U", passwordHash: "x" },
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

    const goodOutput = {
      summary: "x".repeat(40),
      rootCause: "y".repeat(40),
      timeline: [],
      recommendations: [],
    };

    let call = 0;
    vi.spyOn(llm, "callRcaLlm").mockImplementation(async () => {
      call++;
      const rawText =
        call === 1
          ? JSON.stringify({
              ...goodOutput,
              timeline: [{ at: "not-a-date", event: "ev", source: "audit" }],
            })
          : JSON.stringify(goodOutput);
      return {
        rawText,
        inputTokens: 100 * call,
        outputTokens: 50 * call,
        latencyMs: 200 * call,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      };
    });

    const r = await generateRca({
      orgId: org.id,
      userId: user.id,
      incidentId: incident.id,
    });
    expect(r.retryCount).toBe(1);

    const draft = await prisma.incidentRcaDraft.findUnique({
      where: { id: r.draftId! },
    });
    expect(draft!.inputTokens).toBe(300);
    expect(draft!.outputTokens).toBe(150);
    expect(draft!.latencyMs).toBe(600);
  });
});
