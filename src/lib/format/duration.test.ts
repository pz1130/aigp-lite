import { describe, it, expect } from "vitest";
import { formatDuration } from "./duration";

describe("formatDuration", () => {
  it("formats seconds-and-under as '< 1m'", () => {
    expect(formatDuration(0)).toBe("< 1m");
    expect(formatDuration(45_000)).toBe("< 1m");
    expect(formatDuration(59_999)).toBe("< 1m");
  });

  it("formats minutes", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(30 * 60_000)).toBe("30m");
    expect(formatDuration(59 * 60_000)).toBe("59m");
  });

  it("formats hours", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h");
    expect(formatDuration(3 * 60 * 60_000)).toBe("3h");
    expect(formatDuration(23 * 60 * 60_000)).toBe("23h");
  });

  it("formats days", () => {
    expect(formatDuration(24 * 60 * 60_000)).toBe("1d");
    expect(formatDuration(7 * 24 * 60 * 60_000)).toBe("7d");
    expect(formatDuration(30 * 24 * 60 * 60_000)).toBe("30d");
  });

  it("rejects negative input (caller's responsibility)", () => {
    expect(formatDuration(-1000)).toBe("< 1m");
  });
});
