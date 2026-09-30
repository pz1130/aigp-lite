import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildRetryPrompt,
  type PromptInput,
} from "./prompt";

function baseInput(over: Partial<PromptInput> = {}): PromptInput {
  return {
    incident: {
      id: "inc-1",
      title: "Agent leaked SSN",
      severity: "high",
      status: "open",
      category: "data_leak",
      frameworkRefs: { "owasp-asi": ["LLM02"] },
      openedAt: "2026-05-25T10:00:00Z",
      closedAt: null,
      rootCause: "",
    },
    usecase: {
      name: "HR Bot",
      autonomyLevel: "assistive",
      deploymentType: "internal",
      description: "Internal chatbot that helps employees with HR queries.",
    },
    policyEvaluation: { hit: true, snippet: "user provided SSN: 123-45-6789" },
    llmInvocation: {
      provider: "anthropic",
      model: "claude-opus-4-7",
      blocked: false,
      promptHash: "abc",
    },
    auditTail: [
      {
        ts: "2026-05-25T10:01:00Z",
        action: "incident.create",
        actorEmail: "alice@x.com",
      },
    ],
    siblingIncidents: [
      {
        id: "inc-2",
        title: "Same usecase leak 2",
        severity: "high",
        category: "data_leak",
        openedAt: "2026-05-01T00:00:00Z",
      },
    ],
    ...over,
  };
}

describe("buildSystemPrompt", () => {
  it("contains all six rules", () => {
    const p = buildSystemPrompt(baseInput());
    for (const n of [1, 2, 3, 4, 5, 6]) expect(p).toContain(`${n}.`);
  });

  it("includes incident title, severity, category", () => {
    const p = buildSystemPrompt(baseInput());
    expect(p).toContain("Agent leaked SSN");
    expect(p).toContain("high");
    expect(p).toContain("data_leak");
  });

  it("includes USECASE block when usecase is provided", () => {
    const p = buildSystemPrompt(baseInput());
    expect(p).toContain("USECASE");
    expect(p).toContain("HR Bot");
  });

  it("omits USECASE block when usecase is null", () => {
    const p = buildSystemPrompt(baseInput({ usecase: null }));
    expect(p).not.toContain("=== USECASE ===");
  });

  it("includes POLICY EVALUATION block when present", () => {
    const p = buildSystemPrompt(baseInput());
    expect(p).toContain("POLICY EVALUATION");
    expect(p).toContain("user provided SSN");
  });

  it("includes LLM INVOCATION block when present", () => {
    const p = buildSystemPrompt(baseInput());
    expect(p).toContain("LLM INVOCATION");
    expect(p).toContain("anthropic");
  });

  it("audit tail block is at most 4000 chars", () => {
    const big = Array.from({ length: 200 }, (_, i) => ({
      ts: "2026-05-25T10:00:00Z",
      action: "x.action",
      actorEmail: `user${i}@example.com`,
    }));
    const p = buildSystemPrompt(baseInput({ auditTail: big }));
    const match = p.match(/=== AUDIT TAIL ===([\s\S]*?)===/);
    expect(match).toBeTruthy();
    expect(match![1].length).toBeLessThanOrEqual(4200);
  });

  it("includes SIBLING INCIDENTS when relatedUsecaseId implied (usecase present)", () => {
    const p = buildSystemPrompt(baseInput());
    expect(p).toContain("SIBLING INCIDENTS");
    expect(p).toContain("inc-2");
  });

  it("omits SIBLING INCIDENTS when usecase absent", () => {
    const p = buildSystemPrompt(
      baseInput({ usecase: null, siblingIncidents: [] }),
    );
    expect(p).not.toContain("=== SIBLING INCIDENTS ===");
  });

  it("strict JSON output instruction is present", () => {
    const p = buildSystemPrompt(baseInput());
    expect(p.toLowerCase()).toContain("strict json");
    expect(p.toLowerCase()).toContain("no markdown");
  });
});

describe("buildRetryPrompt", () => {
  it("lists prior diagnostic codes", () => {
    const sys = buildSystemPrompt(baseInput());
    const p = buildRetryPrompt(
      sys,
      baseInput(),
      { summary: "", rootCause: "", timeline: [], recommendations: [] },
      [{ code: "timeline_at_invalid", message: "row 2 at is not iso" }],
    );
    expect(p).toContain("timeline_at_invalid");
    expect(p).toContain("row 2 at is not iso");
  });
});
