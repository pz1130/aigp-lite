import { describe, it, expect } from "vitest";
import { oidcProvider } from "./provider";

const cfg = {
  issuer: "https://idp.example.com",
  clientId: "cid",
  clientSecret: "sec",
  orgId: "org_abc",
  buttonLabel: "Log in via Acme",
  allowedDomains: null,
};

describe("oidcProvider", () => {
  it("returns a NextAuth oauth config with id='oidc'", () => {
    const p = oidcProvider(cfg);
    expect(p.id).toBe("oidc");
    expect(p.name).toBe("Log in via Acme");
    expect(p.type).toBe("oauth");
  });

  it("carries issuer, clientId, clientSecret", () => {
    const p = oidcProvider(cfg);
    expect(p.issuer).toBe("https://idp.example.com");
    expect(p.clientId).toBe("cid");
    expect(p.clientSecret).toBe("sec");
  });

  it("requests openid profile email scope", () => {
    const p = oidcProvider(cfg);
    const scope = (p.authorization as { params: { scope: string } }).params
      .scope;
    expect(scope).toContain("openid");
    expect(scope).toContain("profile");
    expect(scope).toContain("email");
  });

  it("uses PKCE and state checks", () => {
    const p = oidcProvider(cfg);
    expect(p.checks).toContain("pkce");
    expect(p.checks).toContain("state");
  });

  it("profile callback lowercases email and maps sub→id", async () => {
    const p = oidcProvider(cfg);
    const out = await p.profile!(
      {
        sub: "abc-123",
        email: "Alice@Example.COM",
        email_verified: true,
        name: "Alice",
      },
      {},
    );
    expect(out.id).toBe("abc-123");
    expect(out.email).toBe("alice@example.com");
    expect(out.name).toBe("Alice");
  });

  it("profile callback tolerates missing name", async () => {
    const p = oidcProvider(cfg);
    const out = await p.profile!(
      { sub: "abc", email: "a@b.com", email_verified: true },
      {},
    );
    expect(out.name).toBeNull();
  });
});
