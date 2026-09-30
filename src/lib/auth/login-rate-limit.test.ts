import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ipConsume, emailConsume } = vi.hoisted(() => ({
  ipConsume: vi.fn(),
  emailConsume: vi.fn(),
}));

vi.mock("next-auth", () => ({
  CredentialsSignin: class extends Error {
    code = "credentials";
  },
}));

vi.mock("@/lib/rate-limit/tokenBucket", () => ({
  loginIpRateLimiter: { consumeByKeyAsync: ipConsume },
  loginEmailRateLimiter: { consumeByKeyAsync: emailConsume },
}));

import { consumeLoginAttempt, LoginRateLimited } from "./login-rate-limit";

const ok = { allowed: true, remaining: 1, resetAt: 0 };
const blocked = { allowed: false, remaining: 0, resetAt: 0 };

function req(ip?: string): Request {
  return new Request("http://localhost/api/auth/callback/credentials", {
    headers: ip ? { "x-forwarded-for": ip } : {},
  });
}

describe("consumeLoginAttempt", () => {
  beforeEach(() => {
    ipConsume.mockResolvedValue(ok);
    emailConsume.mockResolvedValue(ok);
  });
  afterEach(() => vi.clearAllMocks());

  it("allows when both buckets allow", async () => {
    await expect(consumeLoginAttempt("a@b.co", req("1.2.3.4"))).resolves.toBe(
      true,
    );
  });

  it("blocks when the IP bucket is exhausted", async () => {
    ipConsume.mockResolvedValue(blocked);
    await expect(consumeLoginAttempt("a@b.co", req("1.2.3.4"))).resolves.toBe(
      false,
    );
  });

  it("blocks when the account bucket is exhausted", async () => {
    emailConsume.mockResolvedValue(blocked);
    await expect(consumeLoginAttempt("a@b.co", req("5.6.7.8"))).resolves.toBe(
      false,
    );
  });

  it("always spends from both buckets", async () => {
    ipConsume.mockResolvedValue(blocked);
    await consumeLoginAttempt("a@b.co", req("1.2.3.4"));
    expect(ipConsume).toHaveBeenCalledTimes(1);
    expect(emailConsume).toHaveBeenCalledTimes(1);
  });

  it("keys by hashed IP and hashed email, never the raw values", async () => {
    await consumeLoginAttempt("a@b.co", req("1.2.3.4"));
    await consumeLoginAttempt("a@b.co", req("9.9.9.9"));
    await consumeLoginAttempt("c@d.co", req("1.2.3.4"));
    const ipKeys = ipConsume.mock.calls.map((c) => c[0]);
    const emailKeys = emailConsume.mock.calls.map((c) => c[0]);
    expect(ipKeys[0]).toBe(ipKeys[2]);
    expect(ipKeys[0]).not.toBe(ipKeys[1]);
    expect(emailKeys[0]).toBe(emailKeys[1]);
    expect(emailKeys[0]).not.toBe(emailKeys[2]);
    for (const k of [...ipKeys, ...emailKeys]) {
      expect(k).not.toContain("1.2.3.4");
      expect(k).not.toContain("a@b.co");
    }
  });

  it("still applies the account bucket without a request", async () => {
    await expect(consumeLoginAttempt("a@b.co", undefined)).resolves.toBe(true);
    expect(emailConsume).toHaveBeenCalledTimes(1);
  });
});

describe("LoginRateLimited", () => {
  it("carries the rate_limited code the login form checks for", () => {
    expect(new LoginRateLimited().code).toBe("rate_limited");
  });
});
