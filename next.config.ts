import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import { API_CSP } from "./src/lib/security/csp";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// The page Content-Security-Policy is NOT here: it carries a per-request nonce,
// so it is set by src/proxy.ts. This file owns the static headers, plus the
// policy for /api, which needs no nonce.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: false,
  // BullMQ ships a dynamic `require(expression)` in its child-processor that
  // webpack cannot statically analyze ("Critical dependency" warning). Treat it
  // as a server-external package so it is required at runtime (and traced into
  // the standalone output) instead of bundled. Producer code already loads it
  // lazily via dynamic import (src/lib/jobs/queue.ts); the worker imports it
  // directly and runs outside the Next build.
  serverExternalPackages: ["bullmq"],
  async headers() {
    return [
      {
        source: "/:locale/trust/:slug/full/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:locale/trust/:slug/full",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:locale/trust/:slug/k/:token",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/trust/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:locale/trust/:slug",
        headers: [{ key: "Cache-Control", value: "public, max-age=300" }],
      },
      { source: "/:path*", headers: securityHeaders },
      // Must stay AFTER the catch-all above: when two rules set the same key,
      // the last one wins. src/proxy.ts never sees these routes (its matcher
      // excludes /api), so this is the only CSP they get.
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: API_CSP },
          // Overrides the DENY above. EvidencePreviewButton renders
          // /api/evidence/download in a same-origin iframe to preview PDFs, and
          // DENY blocks that even from our own pages. Cross-origin framing is
          // still refused, here by SAMEORIGIN and by frame-ancestors in API_CSP.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
});
