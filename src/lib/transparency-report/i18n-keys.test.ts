import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import zh from "../../../messages/zh.json";

const REQUIRED = [
  "portfolio.systems",
  "portfolio.totals",
  "portfolio.system",
  "portfolio.tier",
  "portfolio.readiness",
  "portfolio.incidents",
  "portfolio.systemCount",
  "portfolio.worstTier",
  "portfolio.highRiskBlocked",
  "scope.organization",
];

function has(obj: Record<string, unknown>, dotted: string): boolean {
  return (
    dotted.split(".").reduce<unknown>((acc, k) => {
      if (acc && typeof acc === "object" && k in (acc as object)) {
        return (acc as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj) !== undefined
  );
}

describe("transparencyReport i18n keys", () => {
  it.each(REQUIRED)("en has transparencyReport.%s", (k) => {
    const tr = (en as { transparencyReport: Record<string, unknown> })
      .transparencyReport;
    expect(has(tr, k)).toBe(true);
  });
  it.each(REQUIRED)("zh has transparencyReport.%s", (k) => {
    const tr = (zh as { transparencyReport: Record<string, unknown> })
      .transparencyReport;
    expect(has(tr, k)).toBe(true);
  });
});
