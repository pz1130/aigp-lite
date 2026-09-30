import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderSystemCardPdf } from "./pdf";
import { sampleSystemCardData } from "./testdata";

let prevActEnv: unknown;
beforeAll(() => {
  prevActEnv = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown })
    .IS_REACT_ACT_ENVIRONMENT;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
  ).IS_REACT_ACT_ENVIRONMENT = false;
});
afterAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
  ).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
});

describe("renderSystemCardPdf", () => {
  it("emits a non-empty buffer starting with %PDF", async () => {
    const buf = await renderSystemCardPdf(sampleSystemCardData());
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("handles empty detail sections", async () => {
    const d = sampleSystemCardData();
    d.latestAssessment = null;
    d.evaluations = [];
    d.driftBenchmarks = [];
    d.friaRecords = [];
    d.transparencyReports = [];
    d.openIncidents = [];
    d.snapshot.goLive = null;
    const buf = await renderSystemCardPdf(d);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
