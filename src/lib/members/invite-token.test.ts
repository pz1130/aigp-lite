import { describe, it, expect } from "vitest";
import {
  mintInviteToken,
  hashInviteToken,
  computeInviteExpiry,
  MIN_TOKEN_BYTES,
} from "./invite-token";

describe("mintInviteToken", () => {
  it("returns a base64url token with no padding and at least 32 bytes of entropy", () => {
    const tok = mintInviteToken();
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tok.length).toBeGreaterThanOrEqual(
      Math.ceil((MIN_TOKEN_BYTES * 4) / 3),
    );
  });

  it("produces unique tokens across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(mintInviteToken());
    expect(seen.size).toBe(100);
  });
});

describe("hashInviteToken", () => {
  it("returns a stable 64-char hex SHA-256 digest", () => {
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
    expect(hashInviteToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken("abc")).not.toBe(hashInviteToken("abd"));
  });
});

describe("computeInviteExpiry", () => {
  it("defaults to 7 days from now", () => {
    const before = Date.now();
    const exp = computeInviteExpiry();
    const after = Date.now();
    expect(exp.getTime() - before).toBeGreaterThanOrEqual(7 * 86400_000 - 1000);
    expect(exp.getTime() - after).toBeLessThanOrEqual(7 * 86400_000);
  });

  it("honours INVITE_TOKEN_TTL_DAYS env between 1 and 90", () => {
    const old = process.env.INVITE_TOKEN_TTL_DAYS;
    process.env.INVITE_TOKEN_TTL_DAYS = "3";
    const exp = computeInviteExpiry();
    expect(exp.getTime() - Date.now()).toBeLessThanOrEqual(3 * 86400_000);
    expect(exp.getTime() - Date.now()).toBeGreaterThan(3 * 86400_000 - 1000);
    if (old === undefined) delete process.env.INVITE_TOKEN_TTL_DAYS;
    else process.env.INVITE_TOKEN_TTL_DAYS = old;
  });

  it("clamps non-numeric env values to the 7-day default", () => {
    const old = process.env.INVITE_TOKEN_TTL_DAYS;
    process.env.INVITE_TOKEN_TTL_DAYS = "not-a-number";
    const exp = computeInviteExpiry();
    const delta = exp.getTime() - Date.now();
    expect(delta).toBeLessThanOrEqual(7 * 86400_000);
    expect(delta).toBeGreaterThan(7 * 86400_000 - 1000);
    if (old === undefined) delete process.env.INVITE_TOKEN_TTL_DAYS;
    else process.env.INVITE_TOKEN_TTL_DAYS = old;
  });

  it("clamps env values with trailing garbage to the 7-day default", () => {
    const old = process.env.INVITE_TOKEN_TTL_DAYS;
    process.env.INVITE_TOKEN_TTL_DAYS = "7d";
    const exp = computeInviteExpiry();
    const delta = exp.getTime() - Date.now();
    expect(delta).toBeGreaterThan(7 * 86400_000 - 1000);
    if (old === undefined) delete process.env.INVITE_TOKEN_TTL_DAYS;
    else process.env.INVITE_TOKEN_TTL_DAYS = old;
  });

  it("clamps out-of-range env values to the 7-day default", () => {
    const old = process.env.INVITE_TOKEN_TTL_DAYS;
    for (const bad of ["0", "-1", "91", "999"]) {
      process.env.INVITE_TOKEN_TTL_DAYS = bad;
      const exp = computeInviteExpiry();
      const delta = exp.getTime() - Date.now();
      expect(delta).toBeLessThanOrEqual(7 * 86400_000);
      expect(delta).toBeGreaterThan(7 * 86400_000 - 1000);
    }
    if (old === undefined) delete process.env.INVITE_TOKEN_TTL_DAYS;
    else process.env.INVITE_TOKEN_TTL_DAYS = old;
  });
});
