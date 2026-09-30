import { describe, it, expect } from "vitest";
import { computeOrgDeltas } from "./org-aggregate";

describe("computeOrgDeltas", () => {
  const current = {
    systemCount: 5,
    worstTier: 3,
    byReadiness: { ready: 2, conditionally_ready: 1, not_ready: 1, live: 1 },
    incidentsTotal: 7,
  };

  it("diffs against a prior edition", () => {
    const prior = {
      systemCount: 3,
      worstTier: 2,
      byReadiness: {
        ready: 1,
        conditionally_ready: 1,
        not_ready: 1,
        live: 0,
      },
      incidentsTotal: 4,
    };
    const d = computeOrgDeltas(current, prior, {
      version: 1,
      periodLabel: "2025 H2",
    });
    expect(d.priorEdition).toEqual({ version: 1, periodLabel: "2025 H2" });
    expect(d.systemCount).toEqual({ from: 3, to: 5 });
    expect(d.worstTier).toEqual({ from: 2, to: 3 });
    expect(d.byReadiness.ready).toEqual({ from: 1, to: 2 });
    expect(d.byReadiness.live).toEqual({ from: 0, to: 1 });
    expect(d.incidentsTotal).toEqual({ from: 4, to: 7 });
  });

  it("reports no change when there is no prior edition", () => {
    const d = computeOrgDeltas(current, null, null);
    expect(d.priorEdition).toBeNull();
    expect(d.systemCount).toEqual({ from: 5, to: 5 });
    expect(d.worstTier).toEqual({ from: 3, to: 3 });
    expect(d.byReadiness.not_ready).toEqual({ from: 1, to: 1 });
    expect(d.incidentsTotal).toEqual({ from: 7, to: 7 });
  });
});
