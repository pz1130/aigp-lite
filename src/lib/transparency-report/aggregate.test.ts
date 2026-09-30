import { describe, it, expect } from "vitest";
import { computeTierDeltas, type TxrFrtBlock } from "./aggregate";

function frt(overall: number, cats: [string, number][]): TxrFrtBlock {
  return {
    found: true,
    assessmentId: "a",
    version: 1,
    overallTier: overall,
    byCategory: cats.map(([code, t]) => ({
      code,
      title: code,
      assignedTier: t,
      completionPct: 100,
    })),
  };
}

describe("computeTierDeltas", () => {
  it("marks every category new when there is no prior edition", () => {
    const d = computeTierDeltas(
      frt(2, [
        ["CYBER", 2],
        ["CBRN", 0],
      ]),
      null,
      null,
    );
    expect(d.priorEdition).toBeNull();
    expect(d.overall).toEqual({ from: 0, to: 2 });
    expect(d.byCategory).toEqual([
      { code: "CYBER", from: 0, to: 2, direction: "new" },
      { code: "CBRN", from: 0, to: 0, direction: "new" },
    ]);
  });

  it("computes up/down/same against a prior edition", () => {
    const prior = frt(1, [
      ["CYBER", 1],
      ["CBRN", 2],
    ]);
    const d = computeTierDeltas(
      frt(2, [
        ["CYBER", 2],
        ["CBRN", 2],
        ["MANIP", 1],
      ]),
      prior,
      { version: 3, periodLabel: "2025 H2" },
    );
    expect(d.priorEdition).toEqual({ version: 3, periodLabel: "2025 H2" });
    expect(d.overall).toEqual({ from: 1, to: 2 });
    expect(d.byCategory).toEqual([
      { code: "CYBER", from: 1, to: 2, direction: "up" },
      { code: "CBRN", from: 2, to: 2, direction: "same" },
      { code: "MANIP", from: 0, to: 1, direction: "new" },
    ]);
  });
});
