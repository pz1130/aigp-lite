import { prisma } from "@/lib/db";
import type { FrtCategory, FrtThreshold } from "@/lib/prisma";

export type CatalogThreshold = FrtThreshold;
export type CategoryWithThresholds = FrtCategory & {
  thresholds: CatalogThreshold[];
};

// Minimal structural type so tests can inject a mock client.
type CatalogClient = {
  frtCategory: {
    findMany: (args: unknown) => Promise<CategoryWithThresholds[]>;
  };
};

export async function getCatalog(
  client: CatalogClient = prisma as unknown as CatalogClient,
): Promise<CategoryWithThresholds[]> {
  return client.frtCategory.findMany({
    orderBy: { order: "asc" },
    include: { thresholds: { orderBy: [{ tier: "asc" }, { order: "asc" }] } },
  });
}

export function flattenThresholds(
  catalog: { thresholds: CatalogThreshold[] }[],
): CatalogThreshold[] {
  return catalog.flatMap((c) => c.thresholds);
}

export function countThresholds(
  catalog: { thresholds: CatalogThreshold[] }[],
): number {
  return flattenThresholds(catalog).length;
}
