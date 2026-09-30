// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@/lib/prisma";
import { recordFrameworkVersion } from "./framework-version";

const prisma = new PrismaClient();

export type SeeAlso = { slug: string; labelEn: string; labelZh: string };
export type CatalogItem = {
  code: string;
  text: string;
  guidance: string | null;
  order: number;
};
export type CatalogSection = {
  num: number;
  key: string;
  title: string;
  intent: string;
  order: number;
  seeAlso: SeeAlso[];
  items: CatalogItem[];
};
export type CatalogJson = {
  _meta: Record<string, string>;
  sections: CatalogSection[];
};

export async function seedAgenticGovernanceCatalog(
  jsonPath = path.join(__dirname, "agentic-governance-catalog.json"),
  client: PrismaClient = prisma,
): Promise<{ sections: number; items: number }> {
  const raw = await readFile(jsonPath, "utf8").catch(() => {
    throw new Error(`[agentic-governance] cannot read ${jsonPath}`);
  });
  const data = JSON.parse(raw) as CatalogJson;
  let nItem = 0;

  for (const s of data.sections) {
    const section = await client.agChkSection.upsert({
      where: { num: s.num },
      update: {
        key: s.key,
        title: s.title,
        intent: s.intent,
        order: s.order,
        seeAlso: s.seeAlso,
      },
      create: {
        num: s.num,
        key: s.key,
        title: s.title,
        intent: s.intent,
        order: s.order,
        seeAlso: s.seeAlso,
      },
    });
    for (const it of s.items) {
      await client.agChkItem.upsert({
        where: { code: it.code },
        update: {
          sectionId: section.id,
          text: it.text,
          guidance: it.guidance,
          order: it.order,
        },
        create: {
          code: it.code,
          sectionId: section.id,
          text: it.text,
          guidance: it.guidance,
          order: it.order,
        },
      });
      nItem++;
    }
  }
  const result = { sections: data.sections.length, items: nItem };
  await recordFrameworkVersion(client, {
    framework: "AGENTIC_GOVERNANCE_CHECKLIST",
    version: data._meta.upstreamRef ?? "unknown",
    itemCount: result.items,
  });
  console.log(
    `  + Agentic governance checklist catalog: ${result.sections} sections / ${result.items} items`,
  );
  return result;
}

if (require.main === module) {
  seedAgenticGovernanceCatalog()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
