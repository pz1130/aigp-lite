import { describe, it, expect } from "vitest";
import {
  FAIRNESS_THRESHOLD,
  METRIC_DIRECTION,
  disparityRatio,
  attributePasses,
  hasDisparity,
  canComplete,
  fairnessSummary,
  type AttributeLite,
} from "./rubric";

const attr = (
  subgroups: { label: string; value: number }[],
): AttributeLite => ({
  name: "gender",
  metric: "selection_rate",
  subgroups,
});

describe("fairness rubric", () => {
  it("threshold is the four-fifths rule", () => {
    expect(FAIRNESS_THRESHOLD).toBe(0.8);
  });

  it("disparityRatio is min/max", () => {
    expect(
      disparityRatio(
        attr([
          { label: "a", value: 0.4 },
          { label: "b", value: 0.5 },
        ]),
      ),
    ).toBeCloseTo(0.8);
  });

  it("returns null when fewer than two subgroups", () => {
    expect(disparityRatio(attr([{ label: "a", value: 0.5 }]))).toBeNull();
  });

  it("returns null when the max is zero", () => {
    expect(
      disparityRatio(
        attr([
          { label: "a", value: 0 },
          { label: "b", value: 0 },
        ]),
      ),
    ).toBeNull();
  });

  it("attributePasses uses the 0.8 cutoff", () => {
    expect(
      attributePasses(
        attr([
          { label: "a", value: 0.4 },
          { label: "b", value: 0.5 },
        ]),
      ),
    ).toBe(true);
    expect(
      attributePasses(
        attr([
          { label: "a", value: 0.3 },
          { label: "b", value: 0.5 },
        ]),
      ),
    ).toBe(false);
    expect(attributePasses(attr([{ label: "a", value: 0.5 }]))).toBeNull();
  });

  it("hasDisparity is true when any computable attribute fails", () => {
    const ok = attr([
      { label: "a", value: 0.45 },
      { label: "b", value: 0.5 },
    ]);
    const bad = attr([
      { label: "a", value: 0.2 },
      { label: "b", value: 0.5 },
    ]);
    expect(hasDisparity([ok])).toBe(false);
    expect(hasDisparity([ok, bad])).toBe(true);
  });

  it("METRIC_DIRECTION marks error_rate lower-better", () => {
    expect(METRIC_DIRECTION.error_rate).toBe("lower_better");
    expect(METRIC_DIRECTION.selection_rate).toBe("higher_better");
  });

  it("canComplete requires a computable attribute and both qualitative checks", () => {
    const computable = [
      attr([
        { label: "a", value: 0.4 },
        { label: "b", value: 0.5 },
      ]),
    ];
    expect(
      canComplete({
        attributes: computable,
        proxyReview: "yes",
        feedbackLoop: "no",
      }),
    ).toBe(true);
    expect(
      canComplete({
        attributes: computable,
        proxyReview: null,
        feedbackLoop: "no",
      }),
    ).toBe(false);
    expect(
      canComplete({ attributes: [], proxyReview: "yes", feedbackLoop: "no" }),
    ).toBe(false);
  });

  it("fairnessSummary reports counts and the worst ratio", () => {
    const ok = attr([
      { label: "a", value: 0.45 },
      { label: "b", value: 0.5 },
    ]);
    const bad = attr([
      { label: "a", value: 0.2 },
      { label: "b", value: 0.5 },
    ]);
    const s = fairnessSummary({
      attributes: [ok, bad],
      proxyReview: "yes",
      feedbackLoop: "not_applicable",
    });
    expect(s.attributesAssessed).toBe(2);
    expect(s.attributesFailing).toBe(1);
    expect(s.worstRatio).toBeCloseTo(0.4);
    expect(s.proxyReview).toBe("yes");
  });
});
