import { describe, it, expect, vi, afterEach } from "vitest";
import { signTrustCookie, verifyTrustCookie } from "./cookie";

afterEach(() => vi.useRealTimers());

describe("signTrustCookie / verifyTrustCookie", () => {
  it("round-trips tokenId and slug", () => {
    const value = signTrustCookie({ tokenId: "tok_1", slug: "acme" });
    const payload = verifyTrustCookie(value);
    expect(payload?.tokenId).toBe("tok_1");
    expect(payload?.slug).toBe("acme");
    expect(payload?.exp).toBeGreaterThan(Date.now());
  });

  it("never contains the raw token", () => {
    const value = signTrustCookie({ tokenId: "tok_1", slug: "acme" });
    expect(value).not.toContain("aigp_trust_");
  });

  it("rejects a tampered payload", () => {
    const value = signTrustCookie({ tokenId: "tok_1", slug: "acme" });
    const [body, sig] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        tokenId: "tok_2",
        slug: "acme",
        exp: Date.now() + 1000,
      }),
    ).toString("base64url");
    expect(forged).not.toBe(body);
    expect(verifyTrustCookie(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a missing or malformed value", () => {
    expect(verifyTrustCookie(undefined)).toBeNull();
    expect(verifyTrustCookie("")).toBeNull();
    expect(verifyTrustCookie("no-dot")).toBeNull();
    expect(verifyTrustCookie(".sig")).toBeNull();
  });

  it("rejects an expired cookie", () => {
    const value = signTrustCookie({ tokenId: "tok_1", slug: "acme" });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
    expect(verifyTrustCookie(value)).toBeNull();
  });
});
