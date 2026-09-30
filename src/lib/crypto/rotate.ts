import { prisma } from "@/lib/db";
import { encryptJsonWithKey, decryptJsonWithKey } from "./secrets";

export type RotateResult =
  | { action: "rotated"; blob: Buffer }
  | { action: "already" }
  | { action: "failed" };

/**
 * Idempotent per-blob rotation: new key already opens it → "already";
 * old key opens it → re-encrypt with the new key; neither → "failed"
 * (operator decides what to do with stragglers).
 */
export function rotateBlob(
  blob: Buffer,
  oldKey: Buffer,
  newKey: Buffer,
): RotateResult {
  try {
    decryptJsonWithKey(newKey, blob);
    return { action: "already" };
  } catch {
    // not encrypted with the new key — fall through to the old key
  }
  let payload: unknown;
  try {
    payload = decryptJsonWithKey(oldKey, blob);
  } catch {
    return { action: "failed" };
  }
  return { action: "rotated", blob: encryptJsonWithKey(newKey, payload) };
}

export interface TableRotationResult {
  table: string;
  rotated: number;
  already: number;
  failed: string[];
}

interface EncryptedRow {
  id: string;
  blob: Uint8Array | null;
}

async function rotateRows(
  table: string,
  rows: EncryptedRow[],
  // Prisma 7 Bytes inputs want Uint8Array<ArrayBuffer>, not Buffer<ArrayBufferLike>
  writeBlob: (id: string, blob: Uint8Array<ArrayBuffer>) => Promise<unknown>,
  oldKey: Buffer,
  newKey: Buffer,
  dryRun: boolean,
): Promise<TableRotationResult> {
  const result: TableRotationResult = {
    table,
    rotated: 0,
    already: 0,
    failed: [],
  };
  for (const row of rows) {
    if (row.blob == null) continue; // nullable column, nothing encrypted
    const res = rotateBlob(Buffer.from(row.blob), oldKey, newKey);
    if (res.action === "already") result.already++;
    else if (res.action === "failed") result.failed.push(row.id);
    else {
      if (!dryRun) await writeBlob(row.id, new Uint8Array(res.blob));
      result.rotated++;
    }
  }
  return result;
}

/**
 * Re-encrypts every encrypted-at-rest column from oldKey to newKey, one row
 * at a time by primary key (org-config volumes are tiny). Idempotent — rows
 * already on the new key count as "already"; undecryptable rows are reported
 * in "failed" and left untouched.
 */
export async function rotateAllTables(
  oldKey: Buffer,
  newKey: Buffer,
  opts: { dryRun: boolean },
): Promise<TableRotationResult[]> {
  const { dryRun } = opts;
  const results: TableRotationResult[] = [];

  const sinks = await prisma.auditSink.findMany({
    select: { id: true, secretsEncrypted: true },
  });
  results.push(
    await rotateRows(
      "audit_sink",
      sinks.map((r) => ({ id: r.id, blob: r.secretsEncrypted })),
      (id, blob) =>
        prisma.auditSink.update({
          where: { id },
          data: { secretsEncrypted: blob },
        }),
      oldKey,
      newKey,
      dryRun,
    ),
  );

  const providers = await prisma.providerConnection.findMany({
    select: { id: true, credentialsEncrypted: true },
  });
  results.push(
    await rotateRows(
      "provider_connection",
      providers.map((r) => ({ id: r.id, blob: r.credentialsEncrypted })),
      (id, blob) =>
        prisma.providerConnection.update({
          where: { id },
          data: { credentialsEncrypted: blob },
        }),
      oldKey,
      newKey,
      dryRun,
    ),
  );

  const integrations = await prisma.enterpriseIntegration.findMany({
    select: { id: true, credentialsEncrypted: true },
  });
  results.push(
    await rotateRows(
      "enterprise_integration",
      integrations.map((r) => ({ id: r.id, blob: r.credentialsEncrypted })),
      (id, blob) =>
        prisma.enterpriseIntegration.update({
          where: { id },
          data: { credentialsEncrypted: blob },
        }),
      oldKey,
      newKey,
      dryRun,
    ),
  );

  const ssoConnections = await prisma.ssoConnection.findMany({
    select: { id: true, clientSecretEncrypted: true },
  });
  results.push(
    await rotateRows(
      "sso_connection",
      ssoConnections.map((r) => ({ id: r.id, blob: r.clientSecretEncrypted })),
      (id, blob) =>
        prisma.ssoConnection.update({
          where: { id },
          data: { clientSecretEncrypted: blob },
        }),
      oldKey,
      newKey,
      dryRun,
    ),
  );

  return results;
}
