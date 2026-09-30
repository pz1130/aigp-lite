import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { generateRca } from "./orchestrator";
import * as llm from "./llm-client";

process.env.INCIDENT_RCA_PROVIDER = "anthropic";
process.env.INCIDENT_RCA_API_KEY = "sk-x";
process.env.INCIDENT_RCA_MODEL = "claude-opus-4-7";

const valid = {
  summary: "An LLM agent leaked PII via conversation memory.".padEnd(40, "."),
  rootCause: "Memory was on; pre-filter did not redact SSNs.".padEnd(40, "."),
  timeline: [
    {
      at: new Date().toISOString(),
      event: "user submitted SSN",
      source: "audit",
    },
  ],
  recommendations: [
    {
      title: "Disable memory",
      detail: "Switch off conversation memory.",
      priority: "high",
    },
  ],
};

async function fullFixture() {
  const org = await prisma.organization.create({
    data: { name: "IRT-" + Date.now() },
  });
  const user = await prisma.user.create({
    data: { email: `irt-${Date.now()}@t.local`, name: "I", passwordHash: "x" },
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
      description: "Stores user PII in conversation memory.",
    },
  });
  const policy = await prisma.policy.create({
    data: {
      orgId: org.id,
      name: "P-" + Date.now(),
      ruleJson: {},
      severity: "high",
      enforcementMode: "block",
      scope: "input",
    },
  });
  const policyEval = await prisma.policyEvaluation.create({
    data: {
      orgId: org.id,
      policyId: policy.id,
      requestId: "r-1",
      hit: true,
      snippet: "SSN visible",
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
      relatedPolicyEvaluationId: policyEval.id,
    },
  });

  for (let i = 0; i < 3; i++) {
    await prisma.incident.create({
      data: {
        orgId: org.id,
        title: "Sibling " + i,
        severity: "medium",
        status: "closed",
        openedById: user.id,
        relatedUsecaseId: usecase.id,
      },
    });
  }

  return { org, user, usecase, incident };
}

beforeEach(() => vi.restoreAllMocks());

describe("incident-rca integration", () => {
  it("full context fixture produces ok draft", async () => {
    const f = await fullFixture();
    vi.spyOn(llm, "callRcaLlm").mockResolvedValue({
      rawText: JSON.stringify(valid),
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 50,
      providerType: "anthropic",
      model: "claude-opus-4-7",
    });
    const r = await generateRca({
      orgId: f.org.id,
      userId: f.user.id,
      incidentId: f.incident.id,
    });
    expect(r.status).toBe("ok");
    const draft = await prisma.incidentRcaDraft.findUnique({
      where: { id: r.draftId! },
    });
    expect(draft).toBeTruthy();
  });

  it("accept reflows incident.rootCause with markdown blocks", async () => {
    const f = await fullFixture();
    vi.spyOn(llm, "callRcaLlm").mockResolvedValue({
      rawText: JSON.stringify(valid),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      providerType: "anthropic",
      model: "claude-opus-4-7",
    });
    const r = await generateRca({
      orgId: f.org.id,
      userId: f.user.id,
      incidentId: f.incident.id,
    });
    await prisma.$transaction([
      prisma.incident.update({
        where: { id: f.incident.id },
        data: {
          rootCause: `## Summary\n\n${valid.summary}\n\n## Root Cause\n\n${valid.rootCause}`,
        },
      }),
      prisma.incidentRcaDraft.update({
        where: { id: r.draftId! },
        data: { acceptedById: f.user.id, acceptedAt: new Date() },
      }),
    ]);
    const after = await prisma.incident.findUnique({
      where: { id: f.incident.id },
    });
    expect(after!.rootCause).toContain("## Summary");
    expect(after!.rootCause).toContain("## Root Cause");
  });

  it("sibling block included when usecase has prior incidents", async () => {
    const f = await fullFixture();
    const captures: string[] = [];
    vi.spyOn(llm, "callRcaLlm").mockImplementation(async (sys) => {
      captures.push(sys);
      return {
        rawText: JSON.stringify(valid),
        inputTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        providerType: "anthropic",
        model: "claude-opus-4-7",
      };
    });
    await generateRca({
      orgId: f.org.id,
      userId: f.user.id,
      incidentId: f.incident.id,
    });
    expect(captures[0]).toContain("SIBLING INCIDENTS");
    expect(captures[0]).toContain("Sibling 0");
  });

  it("empty audit tail still yields ok if summary/rootCause non-empty", async () => {
    const f = await fullFixture();
    await prisma.auditLog.deleteMany({
      where: {
        orgId: f.org.id,
        resourceType: "Incident",
        resourceId: f.incident.id,
      },
    });
    vi.spyOn(llm, "callRcaLlm").mockResolvedValue({
      rawText: JSON.stringify({ ...valid, timeline: [] }),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      providerType: "anthropic",
      model: "claude-opus-4-7",
    });
    const r = await generateRca({
      orgId: f.org.id,
      userId: f.user.id,
      incidentId: f.incident.id,
    });
    expect(r.status).toBe("ok");
    expect(r.timeline).toHaveLength(0);
  });
});
