/**
 * Content-Security-Policy construction.
 *
 * Kept out of `src/proxy.ts` so the directive set can be unit-tested without
 * standing up an Edge request, and so the page policy (nonce-based, set per
 * request by the proxy) and the API policy (static, set by `next.config.ts`)
 * live next to each other where a divergence is visible.
 */

/** Bytes of entropy per nonce. 16 is the floor the CSP spec recommends. */
const NONCE_BYTES = 16;

/**
 * Generates a fresh base64 nonce. Uses Web Crypto, which is present in both the
 * Edge and Node.js runtimes, so the proxy behaves the same wherever it runs.
 */
export function generateNonce(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(NONCE_BYTES))),
  );
}

export type PageCspOptions = {
  /** Per-request nonce; the same value must reach `<ThemeProvider nonce>`. */
  nonce: string;
  /** Relax the policy for `next dev`, which serves eval'd HMR modules. */
  isDev: boolean;
};

/**
 * Builds the policy for HTML documents rendered by the app router.
 *
 * Notes on the directives that are looser than they look:
 * - `style-src` keeps `'unsafe-inline'` because Radix (via react-remove-scroll)
 *   and recharts inject `<style>` elements at runtime, after render, where no
 *   nonce can reach them. A nonce is deliberately NOT added here: a nonce in
 *   `style-src` makes browsers ignore `'unsafe-inline'`, which would break them.
 * - `img-src` keeps `https:` because authored markdown (system cards, policy
 *   text, transparency reports) may embed images from arbitrary hosts.
 * - `worker-src` is spelled out because it otherwise falls back to `script-src`,
 *   and `'strict-dynamic'` there would block a worker loaded from `'self'`.
 *
 * `upgrade-insecure-requests` is intentionally absent: docker-compose serves the
 * app over plain HTTP, so upgrading would break self-hosted deployments that
 * terminate TLS elsewhere or not at all.
 */
export function buildPageCsp({ nonce, isDev }: PageCspOptions): string {
  // Dev mode emits eval'd modules (HMR, source maps), so a strict script-src
  // breaks hydration locally. Relax it there and nowhere else.
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Policy for everything under `/api`. Those responses are JSON, files and
 * redirects — never documents that should load subresources — so nothing is
 * allowed to load at all.
 *
 * Two deliberate exceptions:
 * - `object-src 'self'` keeps the browser's built-in PDF viewer able to render
 *   `/api/evidence/download`, which is a plugin document, not an HTML document.
 * - `frame-ancestors 'self'` (rather than `'none'`) exists because
 *   `EvidencePreviewButton` frames that same endpoint from our own pages. The
 *   matching `X-Frame-Options` override lives in `next.config.ts`.
 */
export const API_CSP = [
  "default-src 'none'",
  "object-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
