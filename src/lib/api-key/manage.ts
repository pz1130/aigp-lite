import crypto from "node:crypto";
import { prisma } from "@/lib/db";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function createApiKey(input: {
  orgId: string;
  label: string;
  scopes?: string[];
}) {
  const raw = "aigp_" + crypto.randomBytes(20).toString("base64url");
  const hash = sha256(raw);
  const prefix = raw.slice(0, 8);
  const row = await prisma.apiKey.create({
    data: {
      orgId: input.orgId,
      label: input.label,
      prefix,
      hash,
      scopes: input.scopes ?? ["runtime.invoke"],
    },
  });
  return { key: raw, prefix, id: row.id };
}

export async function verifyApiKey(
  plain: string,
): Promise<{ orgId: string; id: string; scopes: string[] } | null> {
  if (!plain || !plain.startsWith("aigp_")) return null;
  const row = await prisma.apiKey.findUnique({
    where: { hash: sha256(plain) },
  });
  if (!row) return null;
  await prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return { orgId: row.orgId, id: row.id, scopes: row.scopes as string[] };
}
