// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@/lib/prisma";
import { recordFrameworkVersion } from "./framework-version";

const prisma = new PrismaClient();

export type CatalogItem = {
  code: string;
  text: string;
  guidance: string | null;
  order: number;
};
export type CatalogConsideration = {
  code: string;
  title: string;
  order: number;
  items: CatalogItem[];
};
export type CatalogSection = {
  num: number;
  key: string;
  title: string;
  order: number;
  considerations: CatalogConsideration[];
};
export type CatalogJson = {
  _meta: Record<string, string>;
  sections: CatalogSection[];
};

export async function seedMfChecklistCatalog(
  jsonPath = path.join(__dirname, "mf-checklist-catalog.json"),
  client: PrismaClient = prisma,
): Promise<{ sections: number; considerations: number; items: number }> {
  const raw = await readFile(jsonPath, "utf8").catch(() => {
    throw new Error(`[mf-checklist] cannot read ${jsonPath}`);
  });
  const data = JSON.parse(raw) as CatalogJson;
  let nCon = 0;
  let nItem = 0;

  for (const s of data.sections) {
    const section = await client.mfChecklistSection.upsert({
      where: { num: s.num },
      update: { key: s.key, title: s.title, order: s.order },
      create: { num: s.num, key: s.key, title: s.title, order: s.order },
    });
    for (const c of s.considerations) {
      const consideration = await client.mfChecklistConsideration.upsert({
        where: { code: c.code },
        update: { sectionId: section.id, title: c.title, order: c.order },
        create: {
          code: c.code,
          sectionId: section.id,
          title: c.title,
          order: c.order,
        },
      });
      nCon++;
      for (const it of c.items) {
        await client.mfChecklistItem.upsert({
          where: { code: it.code },
          update: {
            considerationId: consideration.id,
            text: it.text,
            guidance: it.guidance,
            order: it.order,
          },
          create: {
            code: it.code,
            considerationId: consideration.id,
            text: it.text,
            guidance: it.guidance,
            order: it.order,
          },
        });
        nItem++;
      }
    }
  }
  const result = {
    sections: data.sections.length,
    considerations: nCon,
    items: nItem,
  };
  await recordFrameworkVersion(client, {
    framework: "MINDFORGE_CHECKLIST",
    version: data._meta.upstreamRef ?? "unknown",
    itemCount: result.items,
  });
  console.log(
    `  + MindForge checklist catalog: ${result.sections} sections / ${result.considerations} considerations / ${result.items} items`,
  );
  return result;
}

if (require.main === module) {
  seedMfChecklistCatalog()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
