import { describe, expect, it } from "vitest";
import { evaluateTrendAlerts, type TrendAlertInput } from "./alerts";
import type { TrendStats, TrendDeltas } from "./stats";
import { getTrendsConfig } from "./config";

function baseStats(
  total: number,
  bySeverity: Record<string, number> = {},
): TrendStats {
  return {
    total,
    byCategory: {},
    bySeverity,
    byStatus: {},
    topUsecases: [],
    frameworkRollup: {},
    clusteredCount: 0,
    longTailCount: 0,
  };
}

function deltas(partial: Partial<TrendDeltas>): TrendDeltas {
  return { baseline: false, byCategory: {}, bySeverity: {}, ...partial };
}

const config = getTrendsConfig(); // pct 25, floor 3, clusterMin 3

function input(over: Partial<TrendAlertInput>): TrendAlertInput {
  return {
    stats: baseStats(0),
    deltas: deltas({}),
    clusters: [],
    config,
    ...over,
  };
}

describe("evaluateTrendAlerts", () => {
  it("returns [] on a baseline report", () => {
    const out = evaluateTrendAlerts(
      input({ deltas: deltas({ baseline: true }) }),
    );
    expect(out).toEqual([]);
  });

  it("fires total_increase when delta >= floor and pct >= threshold", () => {
    const out = evaluateTrendAlerts(
      input({
        stats: baseStats(15, { high: 15 }),
        deltas: deltas({
          bySeverity: { high: { prev: 10, curr: 15, delta: 5, pct: 50 } },
        }),
      }),
    );
    expect(out).toContainEqual({
      code: "total_increase",
      params: { delta: 5, pct: 50 },
    });
  });

  it("does NOT fire total_increase when below the absolute floor", () => {
    // prev 100 -> curr 102: +2 is >= 25%? no (2%). also < floor 3.
    const out = evaluateTrendAlerts(
      input({
        stats: baseStats(102, { high: 102 }),
        deltas: deltas({
          bySeverity: { high: { prev: 100, curr: 102, delta: 2, pct: 2 } },
        }),
      }),
    );
    expect(out.find((s) => s.code === "total_increase")).toBeUndefined();
  });

  it("does NOT fire total_increase when below the pct threshold", () => {
    // prev 100 -> curr 110: +10 >= floor 3 but 10% < 25%
    const out = evaluateTrendAlerts(
      input({
        stats: baseStats(110, { high: 110 }),
        deltas: deltas({
          bySeverity: { high: { prev: 100, curr: 110, delta: 10, pct: 10 } },
        }),
      }),
    );
    expect(out.find((s) => s.code === "total_increase")).toBeUndefined();
  });

  it("fires severity_increase for critical/high but not low", () => {
    const out = evaluateTrendAlerts(
      input({
        deltas: deltas({
          bySeverity: {
            critical: { prev: 1, curr: 5, delta: 4, pct: 400 },
            low: { prev: 1, curr: 10, delta: 9, pct: 900 },
          },
        }),
      }),
    );
    expect(out).toContainEqual({
      code: "severity_increase",
      params: { bucket: "critical", delta: 4 },
    });
    expect(
      out.find(
        (s) => s.code === "severity_increase" && s.params.bucket === "low",
      ),
    ).toBeUndefined();
  });

  it("fires category_increase per worsening category at/above floor", () => {
    const out = evaluateTrendAlerts(
      input({
        deltas: deltas({
          byCategory: {
            bias: { prev: 0, curr: 3, delta: 3, pct: null },
            privacy: { prev: 5, curr: 6, delta: 1, pct: 20 },
          },
        }),
      }),
    );
    expect(out).toContainEqual({
      code: "category_increase",
      params: { category: "bias", delta: 3 },
    });
    expect(
      out.find(
        (s) =>
          s.code === "category_increase" && s.params.category === "privacy",
      ),
    ).toBeUndefined();
  });

  it("fires large_severe_cluster for a big non-long-tail high/critical cluster", () => {
    const out = evaluateTrendAlerts(
      input({
        clusters: [
          {
            label: "Prompt injection",
            memberCount: 4,
            dominantSeverity: "high",
            isLongTail: false,
          },
          {
            label: "Small low",
            memberCount: 5,
            dominantSeverity: "low",
            isLongTail: false,
          },
          {
            label: "Big long tail",
            memberCount: 9,
            dominantSeverity: "critical",
            isLongTail: true,
          },
          {
            label: "Tiny severe",
            memberCount: 2,
            dominantSeverity: "critical",
            isLongTail: false,
          },
        ],
      }),
    );
    expect(out).toContainEqual({
      code: "large_severe_cluster",
      params: { label: "Prompt injection", memberCount: 4 },
    });
    expect(out.filter((s) => s.code === "large_severe_cluster")).toHaveLength(
      1,
    );
  });

  it("returns [] when nothing worsens", () => {
    const out = evaluateTrendAlerts(
      input({
        stats: baseStats(8, { high: 8 }),
        deltas: deltas({
          bySeverity: { high: { prev: 8, curr: 8, delta: 0, pct: 0 } },
          byCategory: { bias: { prev: 4, curr: 4, delta: 0, pct: 0 } },
        }),
        clusters: [
          {
            label: "ok",
            memberCount: 2,
            dominantSeverity: "high",
            isLongTail: false,
          },
        ],
      }),
    );
    expect(out).toEqual([]);
  });
});
