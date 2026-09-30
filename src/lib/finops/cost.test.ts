import { periodToRange, formatPeriodKey } from "./cost";

describe("periodToRange", () => {
  test("monthly returns first-of-month to first-of-next-month", () => {
    // 2026-05-18 -> May range
    const may18 = new Date("2026-05-18T12:00:00Z");
    const range = periodToRange("monthly", may18);
    expect(range.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  test("monthly handles year boundary", () => {
    const jan10 = new Date("2026-01-10T12:00:00Z");
    const range = periodToRange("monthly", jan10);
    expect(range.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  test("daily returns midnight to midnight+24h", () => {
    const midDay = new Date("2026-05-18T14:30:00Z");
    const range = periodToRange("daily", midDay);
    expect(range.start.toISOString()).toBe("2026-05-18T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-05-19T00:00:00.000Z");
  });

  test("weekly returns Monday to next Monday", () => {
    // 2026-05-18 is a Monday
    const monday = new Date("2026-05-18T12:00:00Z");
    const range = periodToRange("weekly", monday);
    expect(range.start.toISOString()).toBe("2026-05-18T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  test("weekly handles start of week (Sunday)", () => {
    // 2026-05-17 is a Sunday
    const sunday = new Date("2026-05-17T12:00:00Z");
    const range = periodToRange("weekly", sunday);
    // Sunday -> previous Monday (2026-05-11)
    expect(range.start.toISOString()).toBe("2026-05-11T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-05-18T00:00:00.000Z");
  });
});

describe("formatPeriodKey", () => {
  test("daily returns YYYY-MM-DD", () => {
    const start = new Date("2026-05-18T00:00:00Z");
    expect(formatPeriodKey("daily", { start })).toBe("2026-05-18");
  });

  test("monthly returns YYYY-MM", () => {
    const start = new Date("2026-05-01T00:00:00Z");
    expect(formatPeriodKey("monthly", { start })).toBe("2026-05");
  });

  test("weekly returns YYYY-Www", () => {
    const start = new Date("2026-05-18T00:00:00Z");
    expect(formatPeriodKey("weekly", { start })).toBe("2026-W21");
  });

  test("weekly handles year boundary", () => {
    // 2026-01-05 is in week 1 of 2026
    const start = new Date("2026-01-05T00:00:00Z");
    expect(formatPeriodKey("weekly", { start })).toBe("2026-W02");
  });
});
