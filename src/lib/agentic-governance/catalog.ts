import { prisma } from "@/lib/db";
import type { AgChkSection, AgChkItem } from "@/lib/prisma";

export type CatalogItem = AgChkItem;
export type SectionWithItems = AgChkSection & { items: CatalogItem[] };

export type SeeAlso = { slug: string; labelEn: string; labelZh: string };
export type CatalogSection = SectionWithItems & { seeAlso: SeeAlso[] };

type CatalogClient = {
  agChkSection: {
    findMany: (args: unknown) => Promise<SectionWithItems[]>;
  };
};

export function parseSeeAlso(json: unknown): SeeAlso[] {
  if (!Array.isArray(json)) return [];
  const out: SeeAlso[] = [];
  for (const e of json) {
    if (
      e &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).slug === "string" &&
      typeof (e as Record<string, unknown>).labelEn === "string" &&
      typeof (e as Record<string, unknown>).labelZh === "string"
    ) {
      const r = e as Record<string, string>;
      out.push({ slug: r.slug, labelEn: r.labelEn, labelZh: r.labelZh });
    }
  }
  return out;
}

export async function getCatalog(
  client: CatalogClient = prisma as unknown as CatalogClient,
): Promise<SectionWithItems[]> {
  return client.agChkSection.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { order: "asc" } } },
  });
}

export function flattenItems(
  catalog: { items: CatalogItem[] }[],
): CatalogItem[] {
  return catalog.flatMap((s) => s.items);
}

export function countItems(catalog: { items: CatalogItem[] }[]): number {
  return flattenItems(catalog).length;
}

export async function getCatalogWithSeeAlso(
  client: CatalogClient = prisma as unknown as CatalogClient,
): Promise<CatalogSection[]> {
  const sections = await getCatalog(client);
  return sections.map((s) => ({
    ...s,
    seeAlso: parseSeeAlso((s as AgChkSection).seeAlso),
  }));
}
