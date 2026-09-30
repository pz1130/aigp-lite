import { describe, it, expect } from "vitest";
import { renderSystemCardMarkdown } from "./markdown";
import { sampleSystemCardData } from "./testdata";

describe("renderSystemCardMarkdown", () => {
  it("renders all ten sections with key values", () => {
    const md = renderSystemCardMarkdown(sampleSystemCardData());
    expect(md).toContain("# System Card: Loan Approval");
    for (const h of [
      "## 1. System Overview",
      "## 2. Intended Use & Prohibited Uses",
      "## 3. Classification & Risk",
      "## 4. Readiness & Go-live",
      "## 5. Evaluations & Red-teaming",
      "## 6. Drift Monitoring",
      "## 7. Compliance Artifacts",
      "## 8. Incidents",
      "## 9. Known Limitations",
      "## 10. Generation Metadata",
    ]) {
      expect(md).toContain(h);
    }
    expect(md).toContain("> Generated 2026-07-06 by Alice");
    expect(md).toContain(
      "**Intended use:**\n\nDeployed in branch offices to assist loan officers.",
    );
    expect(md).toContain(
      "**Prohibited / out-of-scope use:**\n\nCannot be used for employment or credit decisions outside lending.",
    );
    expect(md).toContain("**HIGH** (score 12, 2026-04-15)");
    expect(md).toContain("| classified | pass | blocking | Art. 6 |");
    expect(md).toContain(
      "Go-live decision: **approved** by Alice on 2026-06-20.",
    );
    expect(md).toContain("- Quarterly re-review");
    expect(md).toContain("`gpt-4o-mini` · 18 / 20 passed (90.0%)");
    expect(md).toContain("Independent external attestations");
    expect(md).toContain("Trail of Bits");
    expect(md).toContain("aaaaaaaa");
    expect(md).toContain("**Core QA benchmark**");
    expect(md).toContain("avg 8.2 / threshold 7");
    expect(md).toContain("FRIA 2026 v1 — `approved` (2026-03-10)");
    expect(md).toContain(
      "Q1 2026 Transparency Report v1 — published 2026-04-02",
    );
    expect(md).toContain(
      "**HIGH** — Elevated false rejections (opened 2026-06-30)",
    );
    expect(md).toContain("Cannot make legal judgments.");
    expect(md).toContain(
      "Generated from live AIGP records; source modules remain the system of record.",
    );
  });

  it("renders fallbacks when sections are empty", () => {
    const d = sampleSystemCardData();
    d.latestAssessment = null;
    d.evaluations = [];
    d.driftBenchmarks = [];
    d.friaRecords = [];
    d.transparencyReports = [];
    d.openIncidents = [];
    d.snapshot.goLive = null;
    d.intendedUse = "No intended use statement documented.";
    d.prohibitedUse = "No prohibited-use statement documented.";
    d.snapshot.classification = {
      present: false,
      euAiActCategory: null,
      isHighRisk: false,
      containsPii: false,
      dataSensitivity: null,
    };
    const md = renderSystemCardMarkdown(d);
    expect(md).toContain(
      "**Intended use:**\n\nNo intended use statement documented.",
    );
    expect(md).toContain(
      "**Prohibited / out-of-scope use:**\n\nNo prohibited-use statement documented.",
    );
    expect(md).toContain("_(not classified)_");
    expect(md).toContain("- **Latest risk assessment**: _(none recorded)_");
    expect(md).toContain("Go-live decision: _(none recorded)_");
    expect(md).toContain("_(no completed evaluations)_");
    expect(md).toContain("_(no drift benchmarks)_");
    expect(md).toContain("FRIA records (0):");
  });
});
