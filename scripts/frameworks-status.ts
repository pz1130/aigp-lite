#!/usr/bin/env tsx
// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
/**
 * Prints the installed upstream version of each built-in AI risk/governance
 * framework catalog, read from the FrameworkVersion table.
 *
 * Usage:
 *   pnpm frameworks:status
 *
 * Rows are written by each catalog importer (finos / atlas / nist / iso42001 /
 * euaiact / aivtf / imda) on a successful import. If a framework is missing here, its
 * importer has not been run against this database yet.
 */
import { PrismaClient } from "@/lib/prisma";

const prisma = new PrismaClient();

/** Friendly labels keyed by the stored `framework` value. */
const LABELS: Record<string, string> = {
  FINOS_AIGF: "FINOS AI Governance Framework",
  MITRE_ATLAS: "MITRE ATLAS",
  NIST_AI_RMF: "NIST AI Risk Management Framework",
  ISO_42001: "ISO/IEC 42001 AI Management System",
  EU_AI_ACT: "EU Artificial Intelligence Act",
  AIVTF: "AI Verify Testing Framework",
  IMDA: "IMDA Starter Kit (Moonshot refs)",
  MINDFORGE: "MindForge AI Risk Management",
  MINDFORGE_CHECKLIST: "MindForge Appendix H Checklist",
  OWASP_ASI: "OWASP Top 10 for Agentic Applications",
};

/**
 * Pads to a fixed column width, always leaving at least one trailing space so
 * adjacent columns never collide. Over-long values (e.g. a full 40-char git
 * SHA in the version field) are truncated with an ellipsis to keep the table
 * aligned.
 */
function pad(s: string, n: number): string {
  const max = n - 1; // reserve one space as the column gap
  const v = s.length > max ? s.slice(0, max - 1) + "…" : s;
  return v + " ".repeat(n - v.length);
}

async function main(): Promise<void> {
  const rows = await prisma.frameworkVersion.findMany({
    orderBy: { framework: "asc" },
  });

  if (rows.length === 0) {
    console.log("No framework versions recorded yet.");
    console.log(
      "Run the importers (e.g. `pnpm aivtf:import`, `pnpm finos:import`) to populate this.",
    );
    return;
  }

  const cols = { fw: 14, name: 36, ver: 24, items: 6 };
  console.log(
    pad("FRAMEWORK", cols.fw) +
      pad("NAME", cols.name) +
      pad("VERSION", cols.ver) +
      pad("ITEMS", cols.items) +
      "IMPORTED",
  );
  console.log("-".repeat(cols.fw + cols.name + cols.ver + cols.items + 19));

  for (const r of rows) {
    console.log(
      pad(r.framework, cols.fw) +
        pad(LABELS[r.framework] ?? "—", cols.name) +
        pad(r.version, cols.ver) +
        pad(String(r.itemCount), cols.items) +
        r.importedAt.toISOString().slice(0, 10),
    );
  }
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
