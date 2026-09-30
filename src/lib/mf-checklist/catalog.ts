import { prisma } from "@/lib/db";
import type {
  MfChecklistSection,
  MfChecklistConsideration,
  MfChecklistItem,
} from "@/lib/prisma";

export type CatalogItem = MfChecklistItem;
export type CatalogConsideration = MfChecklistConsideration & {
  items: CatalogItem[];
};
export type CatalogSection = MfChecklistSection & {
  considerations: CatalogConsideration[];
};

export async function getCatalog(): Promise<CatalogSection[]> {
  return prisma.mfChecklistSection.findMany({
    orderBy: { order: "asc" },
    include: {
      considerations: {
        orderBy: { order: "asc" },
        include: { items: { orderBy: { order: "asc" } } },
      },
    },
  });
}

export function flattenItems(catalog: CatalogSection[]): CatalogItem[] {
  return catalog.flatMap((s) => s.considerations.flatMap((c) => c.items));
}

export function countItems(catalog: CatalogSection[]): number {
  return flattenItems(catalog).length;
}
