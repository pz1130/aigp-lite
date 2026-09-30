// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { generateTrustToken } from "@/lib/trust-center/token";
import {
  TRUST_COOKIE_NAME,
  verifyTrustCookie,
} from "@/lib/trust-center/cookie";
import { trustRedeemRateLimiter } from "@/lib/rate-limit/tokenBucket";
import { GET } from "./route";

async function scenario() {
  const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
  const org = await prisma.organization.create({
    data: { name: "TRUST-K-" + suffix },
  });
  const user = await prisma.user.create({
    data: { email: `trust-k-${suffix}@example.com`, name: "K Tester" },
  });
  const slug = "k" + suffix.replace(/[^a-z0-9]/gi, "").slice(0, 18);
  await prisma.trustProfile.create({
    data: { orgId: org.id, slug, enabled: true, displayName: "Acme" },
  });
  const { raw, hash, prefix } = generateTrustToken();
  await prisma.trustAccessToken.create({
    data: {
      orgId: org.id,
      tokenHash: hash,
      tokenPrefix: prefix,
      label: "Acme DD",
      createdById: user.id,
    },
  });
  return { org, slug, raw };
}

function call(locale: string, slug: string, token: string) {
  const url = `http://localhost/${locale}/trust/${slug}/k/${token}`;
  return GET(new NextRequest(url), {
    params: Promise.resolve({ locale, slug, token }),
  });
}

beforeEach(() => {
  trustRedeemRateLimiter.cleanup();
});

describe("GET /[locale]/trust/[slug]/k/[token]", () => {
  it("sets a signed cookie and redirects to /full", async () => {
    const { slug, raw } = await scenario();
    const res = await call("en", slug, raw);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/en/trust/${slug}/full`);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${TRUST_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain(raw);

    const value = decodeURIComponent(
      setCookie.split(`${TRUST_COOKIE_NAME}=`)[1]!.split(";")[0]!,
    );
    expect(verifyTrustCookie(value)?.slug).toBe(slug);
  });

  it("404s for an unknown token", async () => {
    const { slug } = await scenario();
    const res = await call("en", slug, "aigp_trust_nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("404s when the token belongs to a different org's slug", async () => {
    const a = await scenario();
    const b = await scenario();
    const res = await call("en", a.slug, b.raw);
    expect(res.status).toBe(404);
  });

  it("404s when the profile is disabled", async () => {
    const { org, slug, raw } = await scenario();
    await prisma.trustProfile.update({
      where: { orgId: org.id },
      data: { enabled: false },
    });
    expect((await call("en", slug, raw)).status).toBe(404);
  });
});
