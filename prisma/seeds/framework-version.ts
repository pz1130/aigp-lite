import type { PrismaClient } from "@/lib/prisma";

/** Minimal client surface so importers can pass either the global client or a tx. */
type VersionClient = Pick<PrismaClient, "frameworkVersion">;

export interface FrameworkVersionRecord {
  /** Stable framework key, e.g. "FINOS_AIGF" | "MITRE_ATLAS" | "AIVTF" | "IMDA". */
  framework: string;
  /** Upstream ref/version string read from the catalog's _meta. */
  version: string;
  /** Number of top-level items imported (risks / principles / mappings). */
  itemCount: number;
}

/**
 * Records (or updates) which upstream version of a framework catalog is now
 * seeded. Idempotent: one row per framework, keyed by `framework`. Call at the
 * end of a successful import so the row reflects what is actually in the DB.
 */
export async function recordFrameworkVersion(
  client: VersionClient,
  rec: FrameworkVersionRecord,
): Promise<void> {
  await client.frameworkVersion.upsert({
    where: { framework: rec.framework },
    create: {
      framework: rec.framework,
      version: rec.version,
      itemCount: rec.itemCount,
    },
    update: { version: rec.version, itemCount: rec.itemCount },
  });
}
