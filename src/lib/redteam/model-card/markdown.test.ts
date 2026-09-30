import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";
import type { ModelCardData } from "./aggregator";

const sample: ModelCardData = {
  usecase: {
    id: "u1",
    name: "Loan Approval",
    lifecycleStage: "production",
    autonomyLevel: "assistant",
    deploymentType: "built",
    description: "Approves consumer loans under $50k.",
  },
  inventory: { ownerName: "Alice", ownerEmail: "alice@example.com" },
  risk: {
    topRisks: [
      {
        id: "r1",
        title: "Bias risk in underwriting",
        severity: "high",
        assessedAt: new Date("2026-04-15"),
      },
    ],
  },
  evaluations: [
    {
      id: "e1",
      createdAt: new Date("2026-05-01"),
      model: "gpt-4o-mini",
      totalPrompts: 20,
      passedCount: 18,
      failedCount: 2,
      errorCount: 0,
    },
  ],
  knownLimitations: "Cannot make legal judgments.",
  generatedAt: new Date("2026-05-17"),
  generatedBy: { id: "u", name: "Test User" },
};

describe("renderMarkdown", () => {
  it("includes the 7 required sections + title", () => {
    const md = renderMarkdown(sample);
    expect(md).toContain("# Model Card: Loan Approval");
    expect(md).toContain("## 1. Overview");
    expect(md).toContain("## 2. Intended Use");
    expect(md).toContain("## 3. Owners");
    expect(md).toContain("## 4. Risk Assessment Summary");
    expect(md).toContain("## 5. Red-team Evaluation Results");
    expect(md).toContain("## 6. Known Limitations & Caveats");
    expect(md).toContain("## 7. References");
  });

  it("renders risk title and severity", () => {
    const md = renderMarkdown(sample);
    expect(md).toContain("Bias risk in underwriting");
    expect(md).toContain("**HIGH**");
  });

  it("renders evaluation pass-rate and model", () => {
    const md = renderMarkdown(sample);
    expect(md).toContain("18 / 20 passed (90.0%)");
    expect(md).toContain("gpt-4o-mini");
  });

  it("shows empty-state copy when no risks", () => {
    const md = renderMarkdown({ ...sample, risk: { topRisks: [] } });
    expect(md).toContain("_(no risk assessments recorded)_");
  });

  it("shows empty-state copy when no evaluations", () => {
    const md = renderMarkdown({ ...sample, evaluations: [] });
    expect(md).toContain("_(no evaluations run)_");
  });

  it("renders owner email when present", () => {
    const md = renderMarkdown(sample);
    expect(md).toContain("Alice <alice@example.com>");
  });
});
