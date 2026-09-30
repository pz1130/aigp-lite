import { describe, it, expect } from "vitest";
import { generatePublicToken } from "./token";

describe("generatePublicToken", () => {
  it("returns a url-safe opaque token that is unique per call", () => {
    const a = generatePublicToken();
    const b = generatePublicToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});
