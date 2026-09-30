import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import type { CrosswalkRelation } from "@/lib/prisma";

type Target = {
  framework: string;
  code: string;
  relation: CrosswalkRelation;
  note?: string;
};
type Mapping = { practiceCode: string; targets: Target[] };
type CrosswalkJson = {
  _meta: { upstreamRef: string; [k: string]: unknown };
  mappings: Mapping[];
};

export type CrosswalkSeedResult = { created: number; skipped: number };

/**
 * Seeds the MindForge cross-framework crosswalk. Resolves each MindForge
 * practice (source) and each target control by (framework.code, code), then
 * upserts ControlCrosswalk rows. Unresolved source/target codes are skipped
 * with a warning so a typo or an unseeded target framework never aborts the
 * seed. Idempotent via the @@unique([sourceControlId, targetControlId]).
 */
export async function seedMindForgeCrosswalk(
  jsonPath = path.join(__dirname, "mindforge-crosswalk.json"),
): Promise<CrosswalkSeedResult> {
  let raw: string;
  try {
    raw = await readFile(jsonPath, "utf8");
  } catch {
    throw new Error(`[crosswalk] Cannot read ${jsonPath}.`);
  }
  const data = JSON.parse(raw) as CrosswalkJson;

  const frameworks = [
    "MINDFORGE",
    "NIST_AI_RMF",
    "ISO_42001",
    "FINOS_AIGF",
    "EU_AI_ACT",
  ];
  const controls = await prisma.riskControl.findMany({
    where: { framework: { code: { in: frameworks } } },
    select: { id: true, code: true, framework: { select: { code: true } } },
  });
  const idByKey = new Map<string, string>();
  for (const c of controls) idByKey.set(`${c.framework.code}::${c.code}`, c.id);

  let created = 0;
  let skipped = 0;

  for (const m of data.mappings) {
    const sourceId = idByKey.get(`MINDFORGE::${m.practiceCode}`);
    if (!sourceId) {
      console.warn(
        `[crosswalk] unknown MindForge practice ${m.practiceCode} (skipped ${m.targets.length} targets)`,
      );
      skipped += m.targets.length;
      continue;
    }
    for (const t of m.targets) {
      const targetId = idByKey.get(`${t.framework}::${t.code}`);
      if (!targetId) {
        console.warn(
          `[crosswalk] ${m.practiceCode} -> unknown ${t.framework} ${t.code} (skipped)`,
        );
        skipped++;
        continue;
      }
      await prisma.controlCrosswalk.upsert({
        where: {
          sourceControlId_targetControlId: {
            sourceControlId: sourceId,
            targetControlId: targetId,
          },
        },
        update: { relation: t.relation, note: t.note ?? null },
        create: {
          sourceControlId: sourceId,
          targetControlId: targetId,
          relation: t.relation,
          note: t.note ?? null,
        },
      });
      created++;
    }
  }

  console.log(
    `  + MindForge crosswalk: ${created} mappings (${skipped} skipped)`,
  );
  return { created, skipped };
}

if (require.main === module) {
  seedMindForgeCrosswalk()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
