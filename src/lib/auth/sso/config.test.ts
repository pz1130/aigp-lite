import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isSsoEnabled,
  getSsoConfig,
  parseAllowedDomains,
  isEmailAllowed,
  __resetBootFlagForTests,
} from "./config";

const ORIG = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG };
  __resetBootFlagForTests();
});
afterEach(() => {
  process.env = ORIG;
});

describe("isSsoEnabled", () => {
  it("returns false when no env vars are set", () => {
    delete process.env.SSO_OIDC_ISSUER;
    delete process.env.SSO_OIDC_CLIENT_ID;
    delete process.env.SSO_OIDC_CLIENT_SECRET;
    delete process.env.SSO_OIDC_ORG_ID;
    expect(isSsoEnabled()).toBe(false);
  });

  it("returns false when any required env is missing", () => {
    process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    delete process.env.SSO_OIDC_ORG_ID;
    expect(isSsoEnabled()).toBe(false);
  });

  it("returns true when all four required envs present", () => {
    process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    process.env.SSO_OIDC_ORG_ID = "org_abc";
    expect(isSsoEnabled()).toBe(true);
  });
});

describe("getSsoConfig", () => {
  it("throws when disabled", () => {
    delete process.env.SSO_OIDC_ISSUER;
    expect(() => getSsoConfig()).toThrow();
  });

  it("returns config object when enabled", () => {
    process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    process.env.SSO_OIDC_ORG_ID = "org_abc";
    process.env.SSO_OIDC_BUTTON_LABEL = "Log in via Acme";
    process.env.SSO_OIDC_ALLOWED_DOMAINS = "example.com, acme.io";
    const cfg = getSsoConfig();
    expect(cfg).toEqual({
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "sec",
      orgId: "org_abc",
      buttonLabel: "Log in via Acme",
      allowedDomains: ["example.com", "acme.io"],
    });
  });

  it("defaults button label and null allowedDomains", () => {
    process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    process.env.SSO_OIDC_ORG_ID = "org_abc";
    delete process.env.SSO_OIDC_BUTTON_LABEL;
    delete process.env.SSO_OIDC_ALLOWED_DOMAINS;
    const cfg = getSsoConfig();
    expect(cfg.buttonLabel).toBe("Sign in with SSO");
    expect(cfg.allowedDomains).toBeNull();
  });
});

describe("parseAllowedDomains", () => {
  it("returns null for undefined and empty string", () => {
    expect(parseAllowedDomains(undefined)).toBeNull();
    expect(parseAllowedDomains("")).toBeNull();
    expect(parseAllowedDomains("   ")).toBeNull();
  });

  it("splits, trims, and lowercases", () => {
    expect(parseAllowedDomains("Example.com,  ACME.IO  ,foo.org")).toEqual([
      "example.com",
      "acme.io",
      "foo.org",
    ]);
  });
});

describe("isEmailAllowed", () => {
  it("returns true when whitelist is null", () => {
    expect(isEmailAllowed("anyone@whatever.com", null)).toBe(true);
  });

  it("matches exact domain case-insensitively", () => {
    expect(isEmailAllowed("Alice@Example.COM", ["example.com"])).toBe(true);
  });

  it("rejects subdomains (no wildcard)", () => {
    expect(isEmailAllowed("alice@a.example.com", ["example.com"])).toBe(false);
  });

  it("rejects unrelated domains", () => {
    expect(isEmailAllowed("alice@evil.io", ["example.com", "acme.io"])).toBe(
      false,
    );
  });

  it("rejects emails without @", () => {
    expect(isEmailAllowed("not-an-email", ["example.com"])).toBe(false);
  });
});

describe("boot flag interaction", () => {
  it("__resetBootFlagForTests clears any boot-time override", () => {
    process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
    process.env.SSO_OIDC_CLIENT_ID = "cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "sec";
    process.env.SSO_OIDC_ORG_ID = "org_abc";
    expect(isSsoEnabled()).toBe(true);
  });
});
