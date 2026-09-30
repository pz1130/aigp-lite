import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

/**
 * The Content-Security-Policy is assembled in two places — src/proxy.ts owns the
 * nonce-bearing page policy, next.config.ts owns the static /api policy — and
 * the nonce only reaches the renderer because Next copies proxy response headers
 * back onto the request (an undocumented detail of
 * next/dist/server/lib/router-utils/resolve-routes.js). These specs pin the
 * observable result so a Next upgrade that drops that copy fails here rather
 * than shipping every page with unnonced, and therefore blocked, scripts.
 */

test.use({ storageState: storageStateFor("admin") });

// One page per rendering shape: the localized dashboard home, its English
// twin, a data-heavy module page, and /api-docs — which lives outside
// src/app/[locale] and so takes the proxy's non-locale branch.
const PAGES = ["/zh", "/en", "/zh/evidence", "/api-docs"];

test("every page carries a nonce-based CSP", async ({ page }) => {
  for (const path of PAGES) {
    const response = await page.goto(path);
    const csp = response?.headers()["content-security-policy"];
    expect(csp, `${path} has no CSP`).toBeTruthy();
    expect(csp, `${path} script-src is not nonce-based`).toMatch(
      /script-src [^;]*'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(csp, `${path} allows inline scripts`).not.toMatch(
      /script-src [^;]*'unsafe-inline'/,
    );
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  }
});

test("every script tag on a rendered page carries the nonce", async ({
  page,
}) => {
  for (const path of PAGES) {
    const response = await page.goto(path);
    const nonce = response?.headers()["x-nonce"];
    expect(nonce, `${path} has no x-nonce`).toBeTruthy();
    await page.waitForLoadState("domcontentloaded");

    const unnonced = await page.evaluate(() =>
      [...document.querySelectorAll("script")]
        // Browsers intentionally hide a CSP nonce from getAttribute(); the
        // HTMLScriptElement.nonce property is the supported way to inspect it.
        .filter((s) => !(s as HTMLScriptElement).nonce)
        // Only server-emitted tags matter: the ones the browser parses from
        // the HTML. Scripts injected later by already-trusted code inherit
        // their nonce from 'strict-dynamic' and never carry the attribute.
        .map((s) => s.src || s.textContent?.slice(0, 80) || "(empty)"),
    );
    expect(unnonced, `${path} served scripts without a nonce`).toEqual([]);
  }
});

test("the theme script survives the CSP", async ({ page }) => {
  // next-themes writes its own anti-flash inline script, which Next does not
  // emit and therefore does not nonce. Without the nonce plumbed through
  // Providers it is blocked and the class never lands on <html>.
  await page.goto("/zh");
  await page.waitForLoadState("domcontentloaded");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.className))
    .toMatch(/\b(light|dark)\b/);
});

test("pages load without the CSP blocking anything", async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      ((window as unknown as { __csp?: string[] }).__csp ??= []).push(
        `${event.violatedDirective} <- ${event.blockedURI}`,
      );
    });
  });

  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const reported = await page.evaluate(
      () => (window as unknown as { __csp?: string[] }).__csp ?? [],
    );
    violations.push(...reported.map((v) => `${path}: ${v}`));
  }

  // zod 4 feature-detects its JIT compiler with `Function("")`, which trips
  // script-src in a production build (dev allows 'unsafe-eval'). Zod catches
  // the EvalError and falls back to its interpreted validator, so the probe is
  // reported but nothing is actually broken — everything else must be clean.
  const blocking = violations.filter((v) => !v.endsWith("<- eval"));
  expect(blocking).toEqual([]);
});

test("API responses get the strict policy, not the page one", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'none'");
  expect(headers["content-security-policy"]).not.toContain("nonce-");
  // EvidencePreviewButton frames /api/evidence/download to preview PDFs, so
  // API responses must stay framable from our own origin — DENY breaks that.
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'self'",
  );
});
