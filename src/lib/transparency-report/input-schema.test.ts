import { describe, it, expect } from "vitest";
import { createReportInput, saveSectionInput } from "./input-schema";

describe("txr input schemas", () => {
  it("accepts a valid create input (org-level)", () => {
    const r = createReportInput.parse({
      title: "2026 H1 report",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      periodLabel: "2026 H1",
    });
    expect(r.usecaseId ?? null).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(() =>
      createReportInput.parse({
        title: "",
        periodStart: "2026-01-01",
        periodEnd: "2026-06-30",
        periodLabel: "2026 H1",
      }),
    ).toThrow();
  });

  it("accepts a known section key and rejects an unknown one", () => {
    expect(
      saveSectionInput.parse({ id: "x", key: "safeguards", text: "hi" }).key,
    ).toBe("safeguards");
    expect(() =>
      saveSectionInput.parse({ id: "x", key: "nope", text: "hi" }),
    ).toThrow();
  });

  it("caps section text length", () => {
    expect(() =>
      saveSectionInput.parse({
        id: "x",
        key: "safeguards",
        text: "a".repeat(20001),
      }),
    ).toThrow();
  });
});
