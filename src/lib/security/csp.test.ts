import { describe, it, expect } from "vitest";
import { API_CSP, buildPageCsp, generateNonce } from "./csp";

/** Splits a policy string into a directive -> sources map. */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

describe("generateNonce", () => {
  it("returns a distinct base64 value each call", () => {
    const nonces = new Set(Array.from({ length: 50 }, generateNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
      // 16 random bytes -> 24 base64 characters.
      expect(nonce).toHaveLength(24);
    }
  });
});

describe("buildPageCsp", () => {
  const prod = buildPageCsp({ nonce: "abc123", isDev: false });
  const dev = buildPageCsp({ nonce: "abc123", isDev: true });

  it("carries the nonce and strict-dynamic in script-src", () => {
    expect(parse(prod)["script-src"]).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
    ]);
  });

  it("allows eval in development only", () => {
    expect(parse(dev)["script-src"]).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("never allows unsafe-inline scripts", () => {
    // 'strict-dynamic' makes browsers ignore host allowlists but NOT
    // 'unsafe-inline', so this has to be asserted rather than assumed.
    expect(parse(dev)["script-src"]).not.toContain("'unsafe-inline'");
    expect(parse(prod)["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("locks down the directives that have no legitimate use here", () => {
    const directives = parse(prod);
    expect(directives["default-src"]).toEqual(["'self'"]);
    expect(directives["object-src"]).toEqual(["'none'"]);
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(directives["base-uri"]).toEqual(["'self'"]);
    expect(directives["form-action"]).toEqual(["'self'"]);
    expect(directives["connect-src"]).toEqual(["'self'"]);
  });

  it("spells out the directives that would otherwise inherit script-src", () => {
    // worker-src falls back through child-src to script-src, where
    // 'strict-dynamic' would block a worker loaded from 'self'.
    const directives = parse(prod);
    expect(directives["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(directives["frame-src"]).toEqual(["'self'"]);
    expect(directives["manifest-src"]).toEqual(["'self'"]);
  });

  it("keeps style-src inline-capable without a nonce", () => {
    // Radix (react-remove-scroll) and recharts inject <style> elements after
    // render. A nonce in style-src would make browsers ignore 'unsafe-inline'
    // and break them, so the nonce must stay out of this directive.
    const styleSrc = parse(prod)["style-src"];
    expect(styleSrc).toContain("'unsafe-inline'");
    expect(styleSrc.join(" ")).not.toContain("nonce-");
  });

  it("does not upgrade insecure requests", () => {
    // docker-compose serves plain HTTP; upgrading breaks self-hosted installs.
    expect(prod).not.toContain("upgrade-insecure-requests");
  });
});

describe("API_CSP", () => {
  it("forbids loading anything by default", () => {
    expect(parse(API_CSP)["default-src"]).toEqual(["'none'"]);
  });

  it("allows same-origin framing so the evidence preview works", () => {
    // EvidencePreviewButton frames /api/evidence/download. 'none' here would
    // break PDF preview; the browser's PDF viewer additionally needs object-src.
    expect(parse(API_CSP)["frame-ancestors"]).toEqual(["'self'"]);
    expect(parse(API_CSP)["object-src"]).toEqual(["'self'"]);
  });

  it("carries no nonce, since next.config.ts sets it statically", () => {
    expect(API_CSP).not.toContain("nonce-");
  });
});
