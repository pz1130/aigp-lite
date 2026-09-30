import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyTrustToken } from "@/lib/trust-center/token";
import {
  TRUST_COOKIE_NAME,
  TRUST_COOKIE_MAX_AGE_SECONDS,
  signTrustCookie,
} from "@/lib/trust-center/cookie";
import { trustRedeemRateLimiter } from "@/lib/rate-limit/tokenBucket";

export const runtime = "nodejs";

/**
 * Redemption endpoint. Renders nothing: it verifies the raw token, exchanges
 * it for an HMAC-signed HttpOnly cookie, and redirects. A token left in the
 * URL leaks through `Referer` to every external link on the page and settles
 * into proxy access logs and Sentry breadcrumbs; this way it appears in
 * exactly one request.
 *
 * Cookie `Path` is `/` rather than `/trust/<slug>`: next-intl runs with
 * `localePrefix: "always"`, so the real page path is `/<locale>/trust/<slug>`
 * and the download endpoint is `/api/trust/<slug>/...`. The slug is bound
 * inside the signed payload instead, which gives the same isolation.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ locale: string; slug: string; token: string }> },
): Promise<Response> {
  const { locale, slug, token } = await ctx.params;

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (
    !(await trustRedeemRateLimiter.consumeByKeyAsync(`trust-redeem:${ip}`))
      .allowed
  ) {
    return new Response("too many requests", { status: 429 });
  }

  const profile = await prisma.trustProfile.findFirst({
    where: { slug, enabled: true },
  });
  if (!profile) return new Response("not found", { status: 404 });

  const verified = await verifyTrustToken(token);
  if (!verified || verified.orgId !== profile.orgId) {
    return new Response("not found", { status: 404 });
  }

  const res = NextResponse.redirect(
    new URL(`/${locale}/trust/${slug}/full`, req.nextUrl.origin),
    302,
  );
  // NextResponse.redirect stringifies an absolute URL; the contract is a
  // same-origin relative Location so the host is not pinned in the 302.
  res.headers.set("Location", `/${locale}/trust/${slug}/full`);
  res.cookies.set({
    name: TRUST_COOKIE_NAME,
    value: signTrustCookie({ tokenId: verified.id, slug }),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRUST_COOKIE_MAX_AGE_SECONDS,
  });
  // Next.js serializes sameSite: "lax" as "SameSite=lax"; the redemption
  // contract (and RFC 6265bis examples) use the canonical "SameSite=Lax".
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    res.headers.set(
      "set-cookie",
      setCookie.replace(/SameSite=lax/i, "SameSite=Lax"),
    );
  }
  return res;
}
