// Hash-chain audit design adapted from MS Agent Governance Toolkit (MIT)
// ADR-0017 (docs/adr/0017-merkle-chain-for-audit-tamper-evidence.md).
import { createHash } from "node:crypto";

/**
 * Canonical JSON: keys sorted recursively, no whitespace,
 * undefined dropped, null preserved, array order preserved.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    const val = (v as Record<string, unknown>)[k];
    if (val !== undefined) out[k] = sortKeys(val);
  }
  return out;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * The 11 fields that go into the hash. Excludes `id` (post-insert cuid)
 * and `selfHash` (the output).
 *
 * Adding/removing/reordering fields here is a CHAIN BREAK across the whole
 * table. Future schema evolution must trigger a re-anchor migration (out of v1).
 */
export interface HashableRow {
  orgId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  ip: string | null;
  userAgent: string | null;
  ts: string; // ISO-8601
  seqNum: number;
  prevHash: string | null;
}

export function computeSelfHash(row: HashableRow): string {
  return sha256Hex(stableStringify(row));
}
