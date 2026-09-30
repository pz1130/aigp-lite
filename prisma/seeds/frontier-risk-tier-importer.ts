// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@/lib/prisma";

const prisma = new PrismaClient();

export type CatalogThreshold = {
  code: string;
  tier: number;
  order: number;
  statement: string;
  guidance: string | null;
};
export type CatalogCategory = {
  code: string;
  order: number;
  title: string;
  summary: string;
  thresholds: CatalogThreshold[];
};
export type CatalogJson = {
  _meta: Record<string, string>;
  categories: CatalogCategory[];
};

export async function seedFrontierRiskTierCatalog(
  jsonPath = path.join(__dirname, "frontier-risk-tier-catalog.json"),
  client: PrismaClient = prisma,
): Promise<{ categories: number; thresholds: number }> {
  const raw = await readFile(jsonPath, "utf8").catch(() => {
    throw new Error(`[frt] cannot read ${jsonPath}`);
  });
  const data = JSON.parse(raw) as CatalogJson;
  let nThreshold = 0;

  for (const c of data.categories) {
    const category = await client.frtCategory.upsert({
      where: { code: c.code },
      update: { order: c.order, title: c.title, summary: c.summary },
      create: {
        code: c.code,
        order: c.order,
        title: c.title,
        summary: c.summary,
      },
    });
    for (const th of c.thresholds) {
      await client.frtThreshold.upsert({
        where: { code: th.code },
        update: {
          categoryId: category.id,
          tier: th.tier,
          order: th.order,
          statement: th.statement,
          guidance: th.guidance,
        },
        create: {
          code: th.code,
          categoryId: category.id,
          tier: th.tier,
          order: th.order,
          statement: th.statement,
          guidance: th.guidance,
        },
      });
      nThreshold++;
    }
  }

  const result = { categories: data.categories.length, thresholds: nThreshold };
  console.log(
    `  + frontier-risk-tier catalog: ${result.categories} categories / ${result.thresholds} thresholds`,
  );
  return result;
}

if (require.main === module) {
  seedFrontierRiskTierCatalog()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
