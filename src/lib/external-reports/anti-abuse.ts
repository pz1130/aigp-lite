import { createHmac, timingSafeEqual } from "node:crypto";

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

/** Returns "<tsMs>.<hmac>" — embedded in the public form, verified on submit. */
export function signRenderedAt(tsMs: number): string {
  const ts = String(tsMs);
  return `${ts}.${mac(ts)}`;
}

/** Returns the ms timestamp if the signature is valid, else null. */
export function verifyRenderedAt(token: string): number | null {
  if (!token || typeof token !== "string") return null;
  const idx = token.indexOf(".");
  if (idx <= 0) return null;
  const tsPart = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!sig) return null;
  if (!timingSafeEqualStr(sig, mac(tsPart))) return null;
  const ts = Number(tsPart);
  return Number.isFinite(ts) ? ts : null;
}

/** Deterministic, non-reversible IP fingerprint for abuse correlation. */
export function hashIp(ip: string | null | undefined): string {
  return mac(`ip:${ip ?? "unknown"}`).slice(0, 32);
}
