import { prisma } from "@/lib/db";
import type { AivtfPrinciple, AivtfOutcome, AivtfProcess } from "@/lib/prisma";

export type CatalogProcess = AivtfProcess;
export type CatalogOutcome = AivtfOutcome & { processes: CatalogProcess[] };
export type CatalogPrinciple = AivtfPrinciple & { outcomes: CatalogOutcome[] };

export async function getCatalog(): Promise<CatalogPrinciple[]> {
  return prisma.aivtfPrinciple.findMany({
    orderBy: { order: "asc" },
    include: {
      outcomes: {
        orderBy: { order: "asc" },
        include: { processes: { orderBy: { order: "asc" } } },
      },
    },
  });
}

export function flattenProcesses(
  catalog: CatalogPrinciple[],
): CatalogProcess[] {
  return catalog.flatMap((p) => p.outcomes.flatMap((o) => o.processes));
}

export function countProcesses(catalog: CatalogPrinciple[]): number {
  return flattenProcesses(catalog).length;
}
