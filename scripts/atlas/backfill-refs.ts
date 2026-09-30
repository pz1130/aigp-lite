#!/usr/bin/env tsx
// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
/**
 * Backfill MITRE ATLAS technique references onto already-seeded FINOS risks.
 *
 * The durable source of truth is prisma/seeds/finos-aigf.json (each mapped risk
 * carries `frameworkRefs.mitreAtlas`). A full re-seed picks those up automatically.
 * This script is for DEPLOYED databases that will NOT be re-seeded: it reads the
 * same JSON and merges only the `mitreAtlas` key into each existing risk row,
 * preserving all other frameworkRefs. Idempotent.
 *
 * Usage:
 *   npm run atlas:backfill
 *   npm run atlas:backfill -- --dry-run
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient, type Prisma } from "@/lib/prisma";

const prisma = new PrismaClient();
const FINOS_JSON = path.resolve(
  __dirname,
  "..",
  "..",
  "prisma",
  "seeds",
  "finos-aigf.json",
);

type FinosRiskJson = {
  code: string;
  frameworkRefs?: Record<string, string[]>;
};

export async function backfillAtlasRefs(
  jsonPath = FINOS_JSON,
  opts: { dryRun?: boolean } = {},
): Promise<{ updated: number; skipped: number }> {
  const raw = await readFile(jsonPath, "utf8");
  const data = JSON.parse(raw) as { risks: FinosRiskJson[] };

  let updated = 0;
  let skipped = 0;

  for (const r of data.risks) {
    const atlas = r.frameworkRefs?.mitreAtlas;
    if (!atlas || atlas.length === 0) {
      skipped += 1;
      continue;
    }

    const row = await prisma.riskCatalog.findFirst({
      where: { source: "FINOS_AIGF", code: r.code, orgId: null },
    });
    if (!row) {
      console.warn(`[atlas-backfill] no DB row for ${r.code} (skipped)`);
      skipped += 1;
      continue;
    }

    const current =
      row.frameworkRefs && typeof row.frameworkRefs === "object"
        ? (row.frameworkRefs as Record<string, unknown>)
        : {};

    // Skip the write if mitreAtlas already matches.
    if (JSON.stringify(current.mitreAtlas) === JSON.stringify(atlas)) {
      skipped += 1;
      continue;
    }

    const merged = { ...current, mitreAtlas: atlas } as Prisma.InputJsonValue;
    if (opts.dryRun) {
      console.log(
        `[atlas-backfill] would update ${r.code} -> ${atlas.join(", ")}`,
      );
    } else {
      await prisma.riskCatalog.update({
        where: { id: row.id },
        data: { frameworkRefs: merged },
      });
    }
    updated += 1;
  }

  console.log(
    `[atlas-backfill] ${opts.dryRun ? "(dry-run) " : ""}updated ${updated}, skipped ${skipped}`,
  );
  return { updated, skipped };
}

// Run directly (tsx) but not when imported by tests.
if (process.argv[1] && process.argv[1].includes("backfill-refs")) {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  backfillAtlasRefs(undefined, { dryRun })
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
