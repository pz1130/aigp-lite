import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import { writeFile, rm } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { seedMindForgeCrosswalk } from "./mindforge-crosswalk-importer";

const TMP = path.join(__dirname, "__xwalk_test.json");

async function ctl(fwCode: string, fwName: string, code: string) {
  const fw = await prisma.riskFramework.upsert({
    where: { code: fwCode },
    update: {},
    create: { code: fwCode, name: fwName, version: "test" },
  });
  return prisma.riskControl.upsert({
    where: { frameworkId_code: { frameworkId: fw.id, code } },
    update: {},
    create: {
      frameworkId: fw.id,
      code,
      title: code,
      description: code,
      severity: "medium",
      frameworkRefs: {},
      sourceUrl: "x",
    },
  });
}

describe("mindforge crosswalk importer", () => {
  let src = "";
  beforeAll(async () => {
    const p = await ctl("MINDFORGE", "MindForge", "C1-P1");
    await ctl("NIST_AI_RMF", "NIST", "GOVERN-2.1");
    await ctl("ISO_42001", "ISO", "A.3.2");
    src = p.id;
  });
  afterAll(async () => {
    await prisma.controlCrosswalk.deleteMany({
      where: { sourceControlId: src },
    });
    await rm(TMP, { force: true });
  });

  it("creates equivalent + related rows and resolves all targets", async () => {
    await writeFile(
      TMP,
      JSON.stringify({
        _meta: { upstreamRef: "test" },
        mappings: [
          {
            practiceCode: "C1-P1",
            targets: [
              {
                framework: "NIST_AI_RMF",
                code: "GOVERN-2.1",
                relation: "equivalent",
                note: "n",
              },
              {
                framework: "ISO_42001",
                code: "A.3.2",
                relation: "related",
                note: "n",
              },
            ],
          },
        ],
      }),
    );
    const res = await seedMindForgeCrosswalk(TMP);
    expect(res.created).toBe(2);
    expect(res.skipped).toBe(0);
    const rows = await prisma.controlCrosswalk.findMany({
      where: { sourceControlId: src },
    });
    expect(rows.map((r) => r.relation).sort()).toEqual([
      "equivalent",
      "related",
    ]);
  });

  it("skips + warns on an unresolved target code, never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeFile(
      TMP,
      JSON.stringify({
        _meta: { upstreamRef: "test" },
        mappings: [
          {
            practiceCode: "C1-P1",
            targets: [
              {
                framework: "NIST_AI_RMF",
                code: "DOES-NOT-EXIST",
                relation: "equivalent",
                note: "n",
              },
            ],
          },
        ],
      }),
    );
    const res = await seedMindForgeCrosswalk(TMP);
    expect(res.skipped).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("is idempotent on re-import (unique dedupes)", async () => {
    const json = JSON.stringify({
      _meta: { upstreamRef: "test" },
      mappings: [
        {
          practiceCode: "C1-P1",
          targets: [
            {
              framework: "NIST_AI_RMF",
              code: "GOVERN-2.1",
              relation: "equivalent",
              note: "n",
            },
          ],
        },
      ],
    });
    await writeFile(TMP, json);
    await seedMindForgeCrosswalk(TMP);
    await seedMindForgeCrosswalk(TMP);
    const rows = await prisma.controlCrosswalk.findMany({
      where: { sourceControlId: src, relation: "equivalent" },
    });
    expect(rows.length).toBe(1);
  });
});

describe("real crosswalk data integrity", () => {
  // Vitest's 5s default is not enough: when the MindForge controls are missing
  // this seeds five whole catalogs (NIST, ISO, FINOS, EU AI Act, MindForge)
  // before it can assert anything, and even the already-seeded path runs the
  // crosswalk importer against a real Postgres. It timed out on a CI runner
  // (run 31868254611) while passing everywhere else — a load-dependent flake,
  // not a slow query worth optimising.
  it("every referenced practice + target code resolves (0 skipped)", async () => {
    const mf = await prisma.riskFramework.findUnique({
      where: { code: "MINDFORGE" },
    });
    const nist = await prisma.riskFramework.findUnique({
      where: { code: "NIST_AI_RMF" },
    });
    if (!mf || !nist) {
      console.warn(
        "[crosswalk] catalogs not seeded in test DB; skipping data-integrity check",
      );
      return;
    }
    const mfControlCount = await prisma.riskControl.count({
      where: { framework: { code: "MINDFORGE" } },
    });
    if (mfControlCount < 51) {
      const { seedNistAiRmf } = await import("./nist-importer");
      const { seedIso42001 } = await import("./iso42001-importer");
      const { seedFinosAigf } = await import("./finos-importer");
      const { seedEuAiAct } = await import("./eu-ai-act-importer");
      const { seedMindForge } = await import("./mindforge-importer");
      await seedNistAiRmf();
      await seedIso42001();
      await seedFinosAigf("00000000-0000-0000-0000-000000000001");
      await seedEuAiAct();
      await seedMindForge();
    }
    const res = await seedMindForgeCrosswalk();
    expect(res.skipped).toBe(0);
    expect(res.created).toBeGreaterThan(0);
  }, 120_000);
});
