// Prisma 7 no longer auto-loads .env; load it explicitly for tsx/vitest entry points.
import "dotenv/config";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@/lib/prisma";
import { recordFrameworkVersion } from "./framework-version";

const prisma = new PrismaClient();

type ImdaMapping = {
  riskCode: string;
  imdaRefs: string[];
};

type ImdaJson = {
  _meta: {
    source: string;
    license: string;
    fetchedAt: string;
    upstreamRef?: string;
  };
  mappings: ImdaMapping[];
};

export function mergeImdaRefs(
  existing: Record<string, string[]>,
  imdaRefs: string[],
): Record<string, string[]> {
  const merged = [
    ...new Set([...(existing.imdaStarterKit ?? []), ...imdaRefs]),
  ];
  return { ...existing, imdaStarterKit: merged };
}

export async function seedImdaRefs(
  jsonPath = path.join(__dirname, "imda-refs.json"),
): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(jsonPath, "utf8");
  } catch {
    throw new Error(`[imda] Cannot read ${jsonPath}.`);
  }
  const data = JSON.parse(raw) as ImdaJson;

  for (const m of data.mappings) {
    const row = await prisma.riskCatalog.findFirst({
      where: { code: m.riskCode, orgId: null },
    });
    if (!row) {
      console.warn(`[imda] risk code ${m.riskCode} not found (skipped)`);
      continue;
    }
    const existingRefs = (row.frameworkRefs as Record<string, string[]>) ?? {};
    const updated = mergeImdaRefs(existingRefs, m.imdaRefs);
    await prisma.riskCatalog.update({
      where: { id: row.id },
      data: { frameworkRefs: updated },
    });
  }
  await recordFrameworkVersion(prisma, {
    framework: "IMDA",
    version: data._meta.upstreamRef ?? "unknown",
    itemCount: data.mappings.length,
  });
  console.log(
    `  + IMDA Starter Kit refs: ${data.mappings.length} mappings processed`,
  );
}

if (require.main === module) {
  seedImdaRefs()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
