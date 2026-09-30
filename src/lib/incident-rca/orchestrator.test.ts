import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRca } from "./orchestrator";
import * as llmClient from "./llm-client";

beforeEach(() => {
  process.env.INCIDENT_RCA_PROVIDER = "anthropic";
  process.env.INCIDENT_RCA_API_KEY = "sk-x";
  process.env.INCIDENT_RCA_MODEL = "claude-opus-4-7";
  vi.restoreAllMocks();
});

async function seed() {
  const org = await prisma.organization.create({
    data: { name: "RcaT-" + Date.now() },
  });
  const user = await prisma.user.create({
    data: { email: `rca-${Date.now()}@t.local`, name: "T", passwordHash: "x" },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: user.id, role: "risk_officer" },
  });
  const usecase = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      ownerId: user.id,
      name: "UC-" + Date.now(),
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "Stores user PII in conversation memory across HR sessions.",
    },
  });
  const incident = await prisma.incident.create({
    data: {
      orgId: org.id,
      title: "Leak " + Date.now(),
      severity: "high",
      status: "open",
      openedById: user.id,
      relatedUsecaseId: usecase.id,
    },
  });
  return { org, user, usecase, incident };
}

function mockLlmJson(json: unknown, tokens = { input: 1000, output: 200 }) {
  return vi.spyOn(llmClient, "callRcaLlm").mockResolvedValue({
    rawText: JSON.stringify(json),
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    latencyMs: 100,
    providerType: "anthropic",
    model: "claude-opus-4-7",
  });
}

const validLlmOutput = {
  summary: "An LLM agent processed an HR query that included an SSN.",
  rootCause:
    "Memory was on and the prompt pre-filter did not redact SSN tokens.",
  timeline: [],
  recommendations: [
    {
      title: "Disable memory",
      detail: "Memory enabled the leak; turn it off.",
      priority: "high",
    },
  ],
};

describe("generateRca", () => {
  it("happy path returns status ok and persists draft", async () => {
    const { org, user, incident } = await seed();
    mockLlmJson(validLlmOutput);
    const r = await generateRca({
      orgId: org.id,
      userId: user.id,
      incidentId: incident.id,
    });
    expect(r.status).toBe("ok");
    expect(r.draftId).toBeTruthy();
    const persisted = await prisma.incidentRcaDraft.findUnique({
      where: { id: r.draftId! },
    });
    expect(persisted!.status).toBe("ok");
    expect(persisted!.inputTokens).toBe(1000);
    expect(persisted!.summary).toBe(validLlmOutput.summary);
  });

  it("returns failed when incident missing / cross-org", async () => {
    const { org, user } = await seed();
    const r = await generateRca({
      orgId: org.id,
      userId: user.id,
      incidentId: "missing-id",
    });
    expect(r.status).toBe("failed");
    expect(r.errorMessage).toBe("incident_not_found");
  });

  it("returns failed with schema_parse_failed when LLM returns non-JSON", async () => {
    const { org, user, incident } = await seed();
    vi.spyOn(llmClient, "callRcaLlm").mockResolvedValue({
      rawText: "this is not json",
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 5,
      providerType: "anthropic",
      model: "claude-opus-4-7",
    });
    const r = await generateRca({
      orgId: org.id,
      userId: user.id,
      incidentId: incident.id,
    });
    expect(r.status).toBe("failed");
    expect(
      r.diagnostics.find((d) => d.code === "schema_parse_failed"),
    ).toBeTruthy();
  });

  it("returns failed when provider throws", async () => {
    const { org, user, incident } = await seed();
    vi.spyOn(llmClient, "callRcaLlm").mockRejectedValue(new Error("network"));
    const r = await generateRca({
      orgId: org.id,
      userId: user.id,
      incidentId: incident.id,
    });
    expect(r.status).toBe("failed");
    expect(r.errorMessage).toBe("provider_error");
  });

  it("retries on needs_review and aggregates tokens", async () => {
    const { org, user, incident } = await seed();
    const spy = vi
      .spyOn(llmClient, "callRcaLlm")
      .mockResolvedValueOnce({
        rawText: JSON.stringify({
          ...validLlmOutput,
          timeline: [{ at: "broken-date", event: "ev", source: "audit" }],
        }),
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 100,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      })
      .mockResolvedValueOnce({
        rawText: JSON.stringify(validLlmOutput),
        inputTokens: 200,
        outputTokens: 80,
        latencyMs: 90,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      });
    const r = await generateRca({
      orgId: org.id,
      userId: user.id,
      incidentId: incident.id,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("ok");
    expect(r.retryCount).toBe(1);
    expect(r.inputTokens).toBe(300);
  });

  it("blocks concurrent runs with already_running", async () => {
    const { org, user, incident } = await seed();
    vi.spyOn(llmClient, "callRcaLlm").mockImplementation(async () => {
      await new Promise((res) => setTimeout(res, 30));
      return {
        rawText: JSON.stringify(validLlmOutput),
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 30,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      };
    });
    const [a, b] = await Promise.all([
      generateRca({ orgId: org.id, userId: user.id, incidentId: incident.id }),
      generateRca({ orgId: org.id, userId: user.id, incidentId: incident.id }),
    ]);
    const sorted = [a.status, b.status].sort();
    expect(sorted).toEqual(["failed", "ok"]);
    const failed = [a, b].find((x) => x.status === "failed")!;
    expect(failed.errorMessage).toBe("already_running");
  });
});
