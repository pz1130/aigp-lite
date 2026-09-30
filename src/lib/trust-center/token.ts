import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export const TRUST_TOKEN_PREFIX = "aigp_trust_";

export interface ActiveTrustToken {
  id: string;
  orgId: string;
  tokenPrefix: string;
  label: string;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function generateTrustToken(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = TRUST_TOKEN_PREFIX + crypto.randomBytes(24).toString("base64url");
  return {
    raw,
    hash: sha256(raw),
    prefix: raw.slice(0, TRUST_TOKEN_PREFIX.length + 8),
  };
}

function isLive(row: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (row.revokedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/** Verifies a raw token from the redemption URL. Null for anything not live. */
export async function verifyTrustToken(
  raw: string,
): Promise<ActiveTrustToken | null> {
  if (!raw || !raw.startsWith(TRUST_TOKEN_PREFIX)) return null;
  const row = await prisma.trustAccessToken.findUnique({
    where: { tokenHash: sha256(raw) },
  });
  if (!row || !isLive(row)) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    tokenPrefix: row.tokenPrefix,
    label: row.label,
  };
}

/**
 * Re-reads a token by id on every confidential request. The signed cookie
 * carries only the id, so revocation takes effect on the next request rather
 * than whenever the cookie lapses.
 */
export async function loadActiveTrustToken(
  tokenId: string,
): Promise<ActiveTrustToken | null> {
  const row = await prisma.trustAccessToken.findUnique({
    where: { id: tokenId },
  });
  if (!row || !isLive(row)) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    tokenPrefix: row.tokenPrefix,
    label: row.label,
  };
}

/** Denormalized usage counters for the admin list; audit is authoritative. */
export async function touchTrustToken(tokenId: string): Promise<void> {
  await prisma.trustAccessToken.update({
    where: { id: tokenId },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
  });
}
