// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient, RiskCatalogSource } from "@/lib/prisma";
import { recordFrameworkVersion } from "./framework-version";

const prisma = new PrismaClient();

type CatalogRiskJson = {
  code: string;
  title: string;
  category?: string;
  summary: string;
  description: string;
  frameworkRefs: Record<string, string[]>;
  relatedRiskCodes: string[];
  sourceUrl: string;
};

type CatalogMitigationJson = {
  code: string;
  title: string;
  category?: string;
  summary: string;
  description: string;
  frameworkRefs: Record<string, string[]>;
  mitigatesRiskCodes: string[];
  relatedMitigationCodes: string[];
  sourceUrl: string;
};

type CatalogJson = {
  _meta: { upstreamRef: string; [k: string]: unknown };
  risks: CatalogRiskJson[];
  mitigations: CatalogMitigationJson[];
};

export type SeedOptions = {
  frameworkCode?: string;
  source?: RiskCatalogSource;
};

const DEFAULT_FRAMEWORK_CODE = "NIST_AI_RMF";
const DEFAULT_SOURCE: RiskCatalogSource = "NIST_AI_RMF";

export async function seedNistAiRmf(
  jsonPath = path.join(__dirname, "nist-ai-rmf-catalog.json"),
  options: SeedOptions = {},
): Promise<{ risks: number; controls: number; links: number }> {
  const frameworkCode = options.frameworkCode ?? DEFAULT_FRAMEWORK_CODE;
  const source = options.source ?? DEFAULT_SOURCE;

  let raw: string;
  try {
    raw = await readFile(jsonPath, "utf8");
  } catch {
    throw new Error(`[nist] Cannot read ${jsonPath}.`);
  }
  const data = JSON.parse(raw) as CatalogJson;

  const framework = await ensureFramework(
    frameworkCode,
    data._meta.upstreamRef,
  );
  console.log(`  + ${frameworkCode} framework`);

  const catalogByCode = await upsertRisks(source, data.risks);
  console.log(`  + NIST catalog: ${catalogByCode.size} risks`);

  const controlByCode = await upsertMitigations(framework.id, data.mitigations);
  console.log(`  + ${frameworkCode}: ${controlByCode.size} controls`);

  const linkCount = await rebuildLinks(
    source,
    data.mitigations,
    catalogByCode,
    controlByCode,
  );
  console.log(`  + NIST links: ${linkCount} risk↔control`);

  await recordFrameworkVersion(prisma, {
    framework: source,
    version: data._meta.upstreamRef,
    itemCount: controlByCode.size,
  });

  return {
    risks: catalogByCode.size,
    controls: controlByCode.size,
    links: linkCount,
  };
}

async function ensureFramework(code: string, upstreamRef: string) {
  const existing = await prisma.riskFramework.findUnique({ where: { code } });
  if (existing) return existing;
  return prisma.riskFramework.create({
    data: {
      code,
      name: "NIST AI Risk Management Framework",
      version: upstreamRef.slice(0, 12),
    },
  });
}

async function upsertRisks(
  source: RiskCatalogSource,
  risks: CatalogRiskJson[],
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
    const row = existing
      ? await prisma.riskCatalog.update({ where: { id: existing.id }, data })
      : await prisma.riskCatalog.create({
          data: { source, code: r.code, orgId: null, ...data },
        });
    byCode.set(r.code, row.id);
  }
  return byCode;
}

async function upsertMitigations(
  frameworkId: string,
  mitigations: CatalogMitigationJson[],
): Promise<Map<string, string>> {
  const byCode = new Map<string, string>();
  for (const m of mitigations) {
    const row = await prisma.riskControl.upsert({
      where: { frameworkId_code: { frameworkId, code: m.code } },
      create: {
        frameworkId,
        code: m.code,
        title: m.title,
        description: m.description,
        severity: "medium",
        frameworkRefs: m.frameworkRefs,
        sourceUrl: m.sourceUrl,
      },
      update: {
        title: m.title,
        description: m.description,
        frameworkRefs: m.frameworkRefs,
        sourceUrl: m.sourceUrl,
      },
    });
    byCode.set(m.code, row.id);
  }
  return byCode;
}

async function rebuildLinks(
  source: RiskCatalogSource,
  mitigations: CatalogMitigationJson[],
  catalogByCode: Map<string, string>,
  controlByCode: Map<string, string>,
): Promise<number> {
  let total = 0;
  for (const m of mitigations) {
    const controlId = controlByCode.get(m.code);
    if (!controlId) continue;

    const targets: string[] = [];
    for (const code of m.mitigatesRiskCodes) {
      const rid = catalogByCode.get(code);
      if (rid) {
        targets.push(rid);
      } else {
        console.warn(
          `[nist] control ${m.code} references unknown risk ${code} (skipped)`,
        );
      }
    }

    // Delete only NIST-scoped links for this control; preserve cross-source links.
    await prisma.riskCatalogMitigation.deleteMany({
      where: { controlId, risk: { source } },
    });

    if (targets.length > 0) {
      await prisma.riskCatalogMitigation.createMany({
        data: targets.map((rid) => ({ riskCatalogId: rid, controlId })),
        skipDuplicates: true,
      });
      total += targets.length;
    }
  }
  return total;
}

if (require.main === module) {
  seedNistAiRmf()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
