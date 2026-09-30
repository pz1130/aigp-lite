import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatRelative,
  formatNumber,
  formatCurrency,
  formatPercent,
  sortCollator,
} from "./intl";

describe("intl utils", () => {
  const d = new Date("2026-05-17T10:00:00Z");

  it("formatDate (en)", () => {
    expect(formatDate(d, "en")).toMatch(/May.*2026/);
  });
  it("formatDate (zh-CN)", () => {
    expect(formatDate(d, "zh-CN")).toMatch(/2026/);
  });
  it("formatNumber 1234 → '1,234' (en)", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
  });
  it("formatCurrency 12.34 → '$12.34' (en)", () => {
    expect(formatCurrency(12.34, "en")).toBe("$12.34");
  });
  it("formatPercent 0.246 → '24.6%' (en)", () => {
    expect(formatPercent(0.246, "en")).toBe("24.6%");
  });
  it("formatRelative produces a relative string", () => {
    const past = new Date(Date.now() - 60_000);
    expect(formatRelative(past, "en")).toMatch(/minute/);
  });
  it("sortCollator handles numeric: '2'<'10'", () => {
    const c = sortCollator("en");
    expect(c.compare("item-2", "item-10")).toBeLessThan(0);
  });
});
