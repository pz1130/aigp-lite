import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildPageCsp, generateNonce } from "@/lib/security/csp";

const i18nMiddleware = createMiddleware(routing);

/**
 * Paths that need the CSP but must NOT be rewritten to a locale. They live
 * outside `src/app/[locale]`, so letting next-intl see them would redirect
 * `/api-docs` to `/zh/api-docs`, which does not exist.
 */
const NON_LOCALE_PATHS = ["/api-docs"];

function isNonLocalePath(pathname: string): boolean {
  return NON_LOCALE_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const response = isNonLocalePath(pathname)
    ? NextResponse.next()
    : (i18nMiddleware(req) as NextResponse);

  response.headers.set("x-pathname", pathname);

  const nonce = generateNonce();
  const csp = buildPageCsp({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
  });

  // The nonce reaches the renderer through this *response* header: Next copies
  // proxy response headers back onto the request (see
  // `next/dist/server/lib/router-utils/resolve-routes.js`) before
  // `app-render.js` reads `content-security-policy` off it and stamps the nonce
  // onto every script tag it emits. That copy is undocumented, so
  // `tests/e2e/csp.spec.ts` asserts the end result — if a Next upgrade drops it,
  // the scripts lose their nonce and that spec fails rather than production.
  response.headers.set("Content-Security-Policy", csp);
  // Read by `src/app/[locale]/layout.tsx` to nonce the one inline script Next
  // does not emit itself (next-themes' anti-flash snippet).
  response.headers.set("x-nonce", nonce);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  // `api(?:/|$)` rather than `api` so `/api-docs` — a real page that needs the
  // nonce-based CSP — is no longer excluded along with the API routes. Those get
  // their own, much stricter policy from `next.config.ts`.
  matcher: ["/((?!api(?:/|$)|_next|_vercel|.*\\..*).*)"],
};
