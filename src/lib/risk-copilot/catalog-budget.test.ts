import { describe, it, expect } from "vitest";
import { estimateTokens, selectCatalogWithinBudget } from "./catalog-budget";

type Row = { source: string; code: string; blob?: string };

function rows(spec: Array<[string, number]>, blob = ""): Row[] {
  const out: Row[] = [];
  for (const [source, n] of spec) {
    for (let i = 0; i < n; i++)
      out.push({ source, code: `${source}-${i}`, blob });
  }
  return out;
}

function keptCountBySource(kept: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of kept) m.set(e.source, (m.get(e.source) ?? 0) + 1);
  return m;
}

describe("estimateTokens", () => {
  it("returns a positive integer that grows with serialized length", () => {
    expect(estimateTokens({ a: "x" })).toBeGreaterThan(0);
    expect(Number.isInteger(estimateTokens({ a: "x" }))).toBe(true);
    expect(estimateTokens("a".repeat(400))).toBeGreaterThan(
      estimateTokens("a"),
    );
  });
});

describe("selectCatalogWithinBudget", () => {
  it("returns everything unchanged when the full list fits the budget", () => {
    const input = rows([
      ["A", 1],
      ["B", 1],
    ]);
    const r = selectCatalogWithinBudget(input, 100_000);
    expect(r.kept).toEqual(input);
    expect(r.dropped).toEqual([]);
  });

  it("truncates fairly: every source keeps >=1 and counts stay balanced (±1)", () => {
    // 3 sources x 4 equal-size entries; budget forces dropping.
    const input = rows(
      [
        ["A", 4],
        ["B", 4],
        ["C", 4],
      ],
      "x".repeat(30),
    );
    const full = estimateTokens(input);
    const budget = Math.floor(full / 2); // clearly forces truncation, fits >1 round
    const r = selectCatalogWithinBudget(input, budget);

    expect(r.kept.length).toBeLessThan(input.length);
    expect(r.dropped.length).toBeGreaterThan(0);

    const counts = keptCountBySource(r.kept);
    // No source wholly dropped while it had entries.
    for (const s of ["A", "B", "C"]) {
      expect(counts.get(s) ?? 0).toBeGreaterThanOrEqual(1);
    }
    // Round-robin keeps within ±1 across sources for equal-size entries.
    const vals = ["A", "B", "C"].map((s) => counts.get(s) ?? 0);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
  });

  it("reports accurate per-source dropped counts, sorted by source asc", () => {
    const input = rows(
      [
        ["B", 3],
        ["A", 3],
      ],
      "x".repeat(30),
    );
    const budget = Math.floor(estimateTokens(input) / 2);
    const r = selectCatalogWithinBudget(input, budget);

    const droppedSum = r.dropped.reduce((s, d) => s + d.count, 0);
    expect(droppedSum).toBe(input.length - r.kept.length);

    const counts = keptCountBySource(r.kept);
    for (const d of r.dropped) {
      const orig = input.filter((e) => e.source === d.source).length;
      expect(d.count).toBe(orig - (counts.get(d.source) ?? 0));
    }
    // sorted ascending by source name
    const names = r.dropped.map((d) => d.source);
    expect(names).toEqual([...names].sort());
  });

  it("is deterministic and keeps the result grouped by source (first-seen order)", () => {
    const input = rows(
      [
        ["A", 4],
        ["B", 4],
        ["C", 4],
      ],
      "x".repeat(30),
    );
    const budget = Math.floor(estimateTokens(input) / 2);
    const a = selectCatalogWithinBudget(input, budget);
    const b = selectCatalogWithinBudget(input, budget);
    expect(a.kept.map((e) => e.code)).toEqual(b.kept.map((e) => e.code));

    // grouped: first-seen source order is A, B, C; sources must appear in blocks.
    const order = ["A", "B", "C"];
    const seq = a.kept.map((e) => order.indexOf(e.source));
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    }
  });

  it("drops an oversized single entry but keeps smaller siblings of other sources", () => {
    const input: Row[] = [
      { source: "A", code: "A-0", blob: "x".repeat(2000) },
      { source: "B", code: "B-0", blob: "y" },
      { source: "B", code: "B-1", blob: "z" },
    ];
    const r = selectCatalogWithinBudget(input, 100);
    expect(r.kept.map((e) => e.code).sort()).toEqual(["B-0", "B-1"]);
    expect(r.dropped).toEqual([{ source: "A", count: 1 }]);
  });
});
