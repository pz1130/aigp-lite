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
export type CatalogSection = {
  num: number;
  key: string;
  asiCode: string;
  title: string;
  order: number;
  items: CatalogItem[];
};
export type CatalogJson = {
  _meta: Record<string, string>;
  sections: CatalogSection[];
};

export async function seedAsiRedteamChecklistCatalog(
  jsonPath = path.join(__dirname, "asi-redteam-checklist-catalog.json"),
  client: PrismaClient = prisma,
): Promise<{ sections: number; items: number }> {
  const raw = await readFile(jsonPath, "utf8").catch(() => {
    throw new Error(`[asi-checklist] cannot read ${jsonPath}`);
  });
  const data = JSON.parse(raw) as CatalogJson;
  let nItem = 0;

  for (const s of data.sections) {
    const section = await client.asiChkSection.upsert({
      where: { num: s.num },
      update: {
        key: s.key,
        asiCode: s.asiCode,
        title: s.title,
        order: s.order,
      },
      create: {
        num: s.num,
        key: s.key,
        asiCode: s.asiCode,
        title: s.title,
        order: s.order,
      },
    });
    for (const it of s.items) {
      await client.asiChkItem.upsert({
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
    framework: "ASI_REDTEAM_CHECKLIST",
    version: data._meta.upstreamRef ?? "unknown",
    itemCount: result.items,
  });
  console.log(
    `  + ASI red-team checklist catalog: ${result.sections} sections / ${result.items} items`,
  );
  return result;
}

if (require.main === module) {
  seedAsiRedteamChecklistCatalog()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
