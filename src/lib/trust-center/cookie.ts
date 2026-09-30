import { createHmac, timingSafeEqual } from "node:crypto";

export const TRUST_COOKIE_NAME = "aigp_trust";
export const TRUST_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface TrustCookiePayload {
  tokenId: string;
  slug: string;
  exp: number;
}

function secret(): string {
  return (
    process.env.AIGP_ENCRYPTION_KEY ??
    process.env.AIGP_ENCRYPTION_SEED ??
    "aigp-dev-default"
  );
}

function mac(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Returns "<base64url(json)>.<hmac>". The raw access token is never stored in
 * the cookie — only its row id, which is re-read (and re-checked for
 * revocation) on every confidential request.
 */
export function signTrustCookie(p: { tokenId: string; slug: string }): string {
  const payload: TrustCookiePayload = {
    tokenId: p.tokenId,
    slug: p.slug,
    exp: Date.now() + TRUST_COOKIE_MAX_AGE_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyTrustCookie(
  value: string | undefined | null,
): TrustCookiePayload | null {
  if (!value || typeof value !== "string") return null;
  const idx = value.indexOf(".");
  if (idx <= 0) return null;
  const body = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!sig) return null;
  if (!timingSafeEqualStr(sig, mac(body))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = parsed as Partial<TrustCookiePayload>;
  if (
    typeof p?.tokenId !== "string" ||
    typeof p?.slug !== "string" ||
    typeof p?.exp !== "number"
  ) {
    return null;
  }
  if (p.exp <= Date.now()) return null;
  return { tokenId: p.tokenId, slug: p.slug, exp: p.exp };
}
