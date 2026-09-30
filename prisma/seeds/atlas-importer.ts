// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient, RiskCatalogSource } from "@/lib/prisma";
import { recordFrameworkVersion } from "./framework-version";

const prisma = new PrismaClient();

type AtlasRiskJson = {
  code: string;
  title: string;
  category?: string;
  summary: string;
  description: string;
  frameworkRefs: Record<string, string[]>;
  relatedRiskCodes: string[];
  /** FINOS control codes (mi-*) this ATLAS risk is mitigated by. Optional. */
  mitigatedByControlCodes?: string[];
  sourceUrl: string;
};

type AtlasJson = {
  _meta: { upstreamRef: string; [k: string]: unknown };
  risks: AtlasRiskJson[];
};

export type AtlasSeedOptions = {
  source?: RiskCatalogSource;
  /** Framework whose controls `mitigatedByControlCodes` resolve against. */
  controlFrameworkCode?: string;
};

const DEFAULT_SOURCE: RiskCatalogSource = "MITRE_ATLAS";
const DEFAULT_CONTROL_FRAMEWORK = "FINOS_AIGF";

/**
 * Seeds the MITRE ATLAS risk catalog. ATLAS entries are risks only (ATLAS
 * ships no mitigation text we want to fabricate), so this importer upserts the
 * global (orgId=null) risk rows and then links each risk to existing FINOS
 * controls named in `mitigatedByControlCodes`. Idempotent.
 */
export async function seedMitreAtlas(
  jsonPath = path.join(__dirname, "mitre-atlas.json"),
  options: AtlasSeedOptions = {},
): Promise<void> {
  const source = options.source ?? DEFAULT_SOURCE;
  const controlFrameworkCode =
    options.controlFrameworkCode ?? DEFAULT_CONTROL_FRAMEWORK;

  let raw: string;
  try {
    raw = await readFile(jsonPath, "utf8");
  } catch {
    throw new Error(`[atlas] Cannot read ${jsonPath}.`);
  }
  const data = JSON.parse(raw) as AtlasJson;

  const catalogByCode = await upsertRisks(source, data.risks);
  console.log(`  + MITRE ATLAS catalog: ${catalogByCode.size} risks`);

  const linkCount = await rebuildLinks(
    source,
    controlFrameworkCode,
    data.risks,
    catalogByCode,
  );
  console.log(
    `  + MITRE ATLAS → ${controlFrameworkCode} controls: ${linkCount} links`,
  );

  await recordFrameworkVersion(prisma, {
    framework: source,
    version: data._meta.upstreamRef,
    itemCount: catalogByCode.size,
  });
}

async function upsertRisks(
  source: RiskCatalogSource,
  risks: AtlasRiskJson[],
): Promise<Map<string, string>> {
  const byCode = new Map<string, string>();
  for (const r of risks) {
    // Prisma upsert doesn't accept null in where-clause composite keys,
    // so we use findFirst + create/update for the nullable orgId.
    const existing = await prisma.riskCatalog.findFirst({
      where: { source, code: r.code, orgId: null },
    });
    const data = {
      title: r.title,
      category: r.category ?? null,
      summary: r.summary,
      description: r.description,
      frameworkRefs: r.frameworkRefs,
      relatedRiskCodes: r.relatedRiskCodes,
      sourceUrl: r.sourceUrl,
    };
    if (existing) {
      await prisma.riskCatalog.update({ where: { id: existing.id }, data });
      byCode.set(r.code, existing.id);
    } else {
      const created = await prisma.riskCatalog.create({
        data: { source, code: r.code, orgId: null, ...data },
      });
      byCode.set(r.code, created.id);
    }
  }
  return byCode;
}

/**
 * Links ATLAS risks to existing controls. Mirrors FINOS rebuildLinks but is
 * keyed by risk (risk → controls) instead of by control. The delete is scoped
 * to each ATLAS risk's own rows so a re-run is idempotent and never touches
 * FINOS-authored links.
 */
async function rebuildLinks(
  source: RiskCatalogSource,
  controlFrameworkCode: string,
  risks: AtlasRiskJson[],
  catalogByCode: Map<string, string>,
): Promise<number> {
  const controls = await prisma.riskControl.findMany({
    where: { framework: { code: controlFrameworkCode } },
    select: { id: true, code: true },
  });
  const controlByCode = new Map(controls.map((c) => [c.code, c.id]));

  let total = 0;
  for (const r of risks) {
    const riskCatalogId = catalogByCode.get(r.code);
    if (!riskCatalogId) continue;

    const targets: string[] = [];
    for (const code of r.mitigatedByControlCodes ?? []) {
      const cid = controlByCode.get(code);
      if (cid) {
        targets.push(cid);
      } else {
        console.warn(
          `[atlas] risk ${r.code} references unknown control ${code} (skipped)`,
        );
      }
    }

    // Replace only this ATLAS risk's links; leave every other row untouched.
    await prisma.riskCatalogMitigation.deleteMany({ where: { riskCatalogId } });

    if (targets.length > 0) {
      await prisma.riskCatalogMitigation.createMany({
        data: targets.map((controlId) => ({ riskCatalogId, controlId })),
        skipDuplicates: true,
      });
      total += targets.length;
    }
  }
  return total;
}
