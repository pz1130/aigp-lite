import { randomBytes, createHash } from "node:crypto";

export const MIN_TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 90;

export function mintInviteToken(): string {
  return randomBytes(MIN_TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function computeInviteExpiry(now: Date = new Date()): Date {
  const rawValue = process.env.INVITE_TOKEN_TTL_DAYS ?? "";
  const raw = /^\d+$/.test(rawValue) ? Number(rawValue) : NaN;
  const days =
    Number.isFinite(raw) && raw >= 1 && raw <= MAX_TTL_DAYS
      ? raw
      : DEFAULT_TTL_DAYS;
  return new Date(now.getTime() + days * 86400_000);
}
