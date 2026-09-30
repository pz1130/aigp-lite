// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient, type AivtfAiType } from "@/lib/prisma";
import { recordFrameworkVersion } from "./framework-version";

const prisma = new PrismaClient();

export type CatalogProcess = {
  code: string;
  text: string;
  typeOfAI: AivtfAiType;
  evidenceType: string | null;
  evidenceGuidance: string | null;
  order: number;
};
export type CatalogOutcome = {
  code: string;
  text: string;
  order: number;
  processes: CatalogProcess[];
};
export type CatalogPrinciple = {
  num: number;
  key: string;
  title: string;
  blurb: string | null;
  order: number;
  outcomes: CatalogOutcome[];
};
export type CatalogJson = {
  _meta: Record<string, string>;
  principles: CatalogPrinciple[];
};

export async function seedAivtfCatalog(
  jsonPath = path.join(__dirname, "aivtf-catalog.json"),
  client: PrismaClient = prisma,
): Promise<{ principles: number; outcomes: number; processes: number }> {
  const raw = await readFile(jsonPath, "utf8").catch(() => {
    throw new Error(`[aivtf] cannot read ${jsonPath}`);
  });
  const data = JSON.parse(raw) as CatalogJson;
  let nOut = 0,
    nProc = 0;

  for (const p of data.principles) {
    const principle = await client.aivtfPrinciple.upsert({
      where: { num: p.num },
      update: { key: p.key, title: p.title, blurb: p.blurb, order: p.order },
      create: {
        num: p.num,
        key: p.key,
        title: p.title,
        blurb: p.blurb,
        order: p.order,
      },
    });
    for (const o of p.outcomes) {
      const outcome = await client.aivtfOutcome.upsert({
        where: { code: o.code },
        update: { principleId: principle.id, text: o.text, order: o.order },
        create: {
          code: o.code,
          principleId: principle.id,
          text: o.text,
          order: o.order,
        },
      });
      nOut++;
      for (const pr of o.processes) {
        await client.aivtfProcess.upsert({
          where: { code: pr.code },
          update: {
            outcomeId: outcome.id,
            text: pr.text,
            typeOfAI: pr.typeOfAI,
            evidenceType: pr.evidenceType,
            evidenceGuidance: pr.evidenceGuidance,
            order: pr.order,
          },
          create: {
            code: pr.code,
            outcomeId: outcome.id,
            text: pr.text,
            typeOfAI: pr.typeOfAI,
            evidenceType: pr.evidenceType,
            evidenceGuidance: pr.evidenceGuidance,
            order: pr.order,
          },
        });
        nProc++;
      }
    }
  }
  const result = {
    principles: data.principles.length,
    outcomes: nOut,
    processes: nProc,
  };
  await recordFrameworkVersion(client, {
    framework: "AIVTF",
    version: data._meta.upstreamRef ?? "unknown",
    itemCount: result.principles,
  });
  console.log(
    `  + AIVTF catalog: ${result.principles} principles / ${result.outcomes} outcomes / ${result.processes} processes`,
  );
  return result;
}

if (require.main === module) {
  seedAivtfCatalog()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
