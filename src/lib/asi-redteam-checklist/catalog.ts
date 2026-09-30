import { prisma } from "@/lib/db";
import type { AsiChkSection, AsiChkItem } from "@/lib/prisma";

export type CatalogItem = AsiChkItem;
export type SectionWithItems = AsiChkSection & { items: CatalogItem[] };

export type CrossLinks = {
  title: string | null;
  atlas: string[];
  llmTop10: string[];
  agenticThreats: string[];
  aivss: string[];
};

export type CatalogSection = SectionWithItems & { crossLinks: CrossLinks };

const EMPTY_CROSS: CrossLinks = {
  title: null,
  atlas: [],
  llmTop10: [],
  agenticThreats: [],
  aivss: [],
};

// Minimal structural type so tests can inject a mock client.
type CatalogClient = {
  asiChkSection: {
    findMany: (args: unknown) => Promise<SectionWithItems[]>;
  };
  riskCatalog: {
    findMany: (args: unknown) => Promise<
      {
        code: string;
        title: string;
        frameworkRefs: unknown;
        relatedRiskCodes: string[];
      }[]
    >;
  };
};

export async function getCatalog(
  client: CatalogClient = prisma as unknown as CatalogClient,
): Promise<SectionWithItems[]> {
  return client.asiChkSection.findMany({
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

export async function resolveCrossLinks(
  asiCodes: string[],
  client: CatalogClient = prisma as unknown as CatalogClient,
): Promise<Map<string, CrossLinks>> {
  const map = new Map<string, CrossLinks>();
  if (asiCodes.length === 0) return map;
  const rows = await client.riskCatalog.findMany({
    where: { source: "OWASP_ASI", orgId: null, code: { in: asiCodes } },
    select: {
      code: true,
      title: true,
      frameworkRefs: true,
      relatedRiskCodes: true,
    },
  });
  for (const r of rows) {
    const refs = (r.frameworkRefs ?? {}) as Record<string, string[]>;
    map.set(r.code, {
      title: r.title,
      atlas: r.relatedRiskCodes ?? [],
      llmTop10: refs.owaspLlmTop10 ?? [],
      agenticThreats: refs.agenticThreats ?? [],
      aivss: refs.aivss ?? [],
    });
  }
  return map;
}

export async function getCatalogWithCrossLinks(
  client: CatalogClient = prisma as unknown as CatalogClient,
): Promise<CatalogSection[]> {
  const sections = await getCatalog(client);
  const map = await resolveCrossLinks(
    sections.map((s) => s.asiCode),
    client,
  );
  return sections.map((s) => ({
    ...s,
    crossLinks: map.get(s.asiCode) ?? EMPTY_CROSS,
  }));
}
