// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient, RiskCatalogSource } from "@/lib/prisma";
import { recordFrameworkVersion } from "./framework-version";

const prisma = new PrismaClient();

type AsiRiskJson = {
  code: string;
  title: string;
  category?: string;
  summary: string;
  description: string;
  frameworkRefs: Record<string, string[]>;
  relatedRiskCodes: string[];
  /** FINOS control codes (mi-*) this ASI risk is mitigated by. Optional. */
  mitigatedByControlCodes?: string[];
  sourceUrl: string;
};

type AsiJson = {
  _meta: { upstreamRef: string; [k: string]: unknown };
  risks: AsiRiskJson[];
};

export type AsiSeedOptions = {
  source?: RiskCatalogSource;
  /** Framework whose controls `mitigatedByControlCodes` resolve against. */
  controlFrameworkCode?: string;
};

const DEFAULT_SOURCE: RiskCatalogSource = "OWASP_ASI";
const DEFAULT_CONTROL_FRAMEWORK = "FINOS_AIGF";

/**
 * Seeds the OWASP Top 10 for Agentic Applications (ASI) risk catalog. ASI
 * entries are risks only (mitigations are folded into each risk's prose, not
 * modeled as controls), so this importer upserts the global (orgId=null) risk
 * rows and then links each risk to existing FINOS controls named in
 * `mitigatedByControlCodes`. Idempotent.
 */
export async function seedOwaspAsi(
  jsonPath = path.join(__dirname, "owasp-asi-catalog.json"),
  options: AsiSeedOptions = {},
): Promise<void> {
  const source = options.source ?? DEFAULT_SOURCE;
  const controlFrameworkCode =
    options.controlFrameworkCode ?? DEFAULT_CONTROL_FRAMEWORK;

  let raw: string;
  try {
    raw = await readFile(jsonPath, "utf8");
  } catch {
    throw new Error(`[owasp-asi] Cannot read ${jsonPath}.`);
  }
  const data = JSON.parse(raw) as AsiJson;

  const catalogByCode = await upsertRisks(source, data.risks);
  console.log(`  + OWASP ASI catalog: ${catalogByCode.size} risks`);

  const linkCount = await rebuildLinks(
    controlFrameworkCode,
    data.risks,
    catalogByCode,
  );
  console.log(
    `  + OWASP ASI → ${controlFrameworkCode} controls: ${linkCount} links`,
  );

  await recordFrameworkVersion(prisma, {
    framework: source,
    version: data._meta.upstreamRef,
    itemCount: catalogByCode.size,
  });
}

async function upsertRisks(
  source: RiskCatalogSource,
  risks: AsiRiskJson[],
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
 * Links ASI risks to existing controls. Keyed by risk (risk → controls). The
 * delete is scoped to each ASI risk's own rows so a re-run is idempotent and
 * never touches FINOS- or other frameworks' authored links.
 */
async function rebuildLinks(
  controlFrameworkCode: string,
  risks: AsiRiskJson[],
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
          `[owasp-asi] risk ${r.code} references unknown control ${code} (skipped)`,
        );
      }
    }

    // Replace only this ASI risk's links; leave every other row untouched.
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

if (require.main === module) {
  seedOwaspAsi()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
