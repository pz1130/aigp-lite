import { describe, it, expect } from "vitest";
import { daysToSunset } from "./sunset";

const now = new Date("2026-07-07T12:00:00.000Z");

describe("daysToSunset", () => {
  it("returns null when there is no sunset date", () => {
    expect(daysToSunset(null, now)).toBeNull();
  });
  it("returns a positive count for a future date", () => {
    expect(daysToSunset(new Date("2026-07-17T00:00:00.000Z"), now)).toBe(10);
  });
  it("returns a negative count when overdue", () => {
    expect(daysToSunset(new Date("2026-07-04T00:00:00.000Z"), now)).toBe(-3);
  });
  it("returns 0 on the sunset day regardless of time", () => {
    expect(daysToSunset(new Date("2026-07-07T23:00:00.000Z"), now)).toBe(0);
  });
});
