import { describe, it, expect } from "vitest";
import { MATRIX } from "./roles";

describe("usage-insights RBAC", () => {
  it("admin has read + write", () => {
    expect(MATRIX.admin.has("usage-insights.read")).toBe(true);
    expect(MATRIX.admin.has("usage-insights.write")).toBe(true);
  });
  it("viewer has read but not write", () => {
    expect(MATRIX.viewer.has("usage-insights.read")).toBe(true);
    expect(MATRIX.viewer.has("usage-insights.write")).toBe(false);
  });
});
