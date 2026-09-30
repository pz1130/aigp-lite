import crypto from "node:crypto";
import { prisma } from "@/lib/db";

const PREFIX = "aigp_scim_";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Generate a fresh bearer token. Returns the raw value (shown once) plus its hash and display prefix. */
export function generateScimToken(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = PREFIX + crypto.randomBytes(20).toString("base64url");
  return { raw, hash: sha256(raw), prefix: raw.slice(0, PREFIX.length + 8) };
}

/** Verify a bearer token against the stored connection. Returns the org + connection on success. */
export async function verifyScimToken(
  bearer: string,
): Promise<{ orgId: string; connectionId: string } | null> {
  if (!bearer || !bearer.startsWith(PREFIX)) return null;
  const row = await prisma.scimConnection.findUnique({
    where: { tokenHash: sha256(bearer) },
  });
  if (!row || !row.enabled) return null;
  return { orgId: row.orgId, connectionId: row.id };
}
