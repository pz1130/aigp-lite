import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@/lib/prisma";
import { seedMindForge } from "./mindforge-importer";

const prisma = new PrismaClient();
const FIXTURE = path.join(
  __dirname,
  "../../tests/fixtures/mindforge/sample.json",
);

async function cleanup() {
  const fw = await prisma.riskFramework.findUnique({
    where: { code: "MINDFORGE" },
  });
  if (fw) {
    const controls = await prisma.riskControl.findMany({
      where: { frameworkId: fw.id },
      select: { id: true },
    });
    await prisma.riskCatalogMitigation.deleteMany({
      where: { controlId: { in: controls.map((c) => c.id) } },
    });
    await prisma.riskControl.deleteMany({ where: { frameworkId: fw.id } });
    await prisma.riskFramework.delete({ where: { id: fw.id } });
  }
  await prisma.riskCatalog.deleteMany({
    where: { source: "MINDFORGE", orgId: null },
  });
  await prisma.frameworkVersion.deleteMany({
    where: { framework: "MINDFORGE" },
  });
}

describe("seedMindForge", () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("seeds framework, controls and risks with counts matching the fixture", async () => {
    const res = await seedMindForge(FIXTURE);
    expect(res.controls).toBe(2);
    expect(res.risks).toBe(2);
    expect(res.links).toBe(2);

    const fw = await prisma.riskFramework.findUniqueOrThrow({
      where: { code: "MINDFORGE" },
    });
    expect(fw.name).toBe("MindForge AI Risk Management");
    const controls = await prisma.riskControl.count({
      where: { frameworkId: fw.id },
    });
    expect(controls).toBe(2);
    const risks = await prisma.riskCatalog.count({
      where: { source: "MINDFORGE", orgId: null },
    });
    expect(risks).toBe(2);
  });

  it("is idempotent on re-run (no duplicates, upserts in place)", async () => {
    await seedMindForge(FIXTURE);
    await seedMindForge(FIXTURE);
    const fw = await prisma.riskFramework.findUniqueOrThrow({
      where: { code: "MINDFORGE" },
    });
    expect(
      await prisma.riskControl.count({ where: { frameworkId: fw.id } }),
    ).toBe(2);
    expect(
      await prisma.riskCatalog.count({
        where: { source: "MINDFORGE", orgId: null },
      }),
    ).toBe(2);
  });

  it("builds risk<->control links from mitigatesRiskCodes", async () => {
    await seedMindForge(FIXTURE);
    const c = await prisma.riskControl.findFirstOrThrow({
      where: { code: "C7-P1" },
    });
    const links = await prisma.riskCatalogMitigation.findMany({
      where: { controlId: c.id },
      include: { risk: true },
    });
    expect(links).toHaveLength(1);
    expect(links[0].risk.code).toBe("MF-R-FB-1");
  });

  it("preserves cross-source links on re-import", async () => {
    await seedMindForge(FIXTURE);
    const c = await prisma.riskControl.findFirstOrThrow({
      where: { code: "C7-P1" },
    });
    const foreign = await prisma.riskCatalog.create({
      data: {
        source: "NIST_AI_RMF",
        code: "FOREIGN-X",
        orgId: null,
        title: "x",
        summary: "x",
        description: "x",
        frameworkRefs: {},
        relatedRiskCodes: [],
        sourceUrl: "x",
      },
    });
    await prisma.riskCatalogMitigation.create({
      data: { controlId: c.id, riskCatalogId: foreign.id },
    });

    await seedMindForge(FIXTURE);

    const stillThere = await prisma.riskCatalogMitigation.findFirst({
      where: { controlId: c.id, riskCatalogId: foreign.id },
    });
    expect(stillThere).not.toBeNull();
    await prisma.riskCatalogMitigation.deleteMany({
      where: { riskCatalogId: foreign.id },
    });
    await prisma.riskCatalog.delete({ where: { id: foreign.id } });
  });

  it("round-trips frameworkRefs (Consideration on controls, ABS flag on risks)", async () => {
    await seedMindForge(FIXTURE);
    const c = await prisma.riskControl.findFirstOrThrow({
      where: { code: "C7-P1" },
    });
    expect(
      (c.frameworkRefs as Record<string, string[]>)["MindForge Consideration"],
    ).toContain("C7 — Model Development & Validation");
    const r = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "MINDFORGE", code: "MF-R-FB-1" },
    });
    expect(
      (r.frameworkRefs as Record<string, string[]>)["ABS Top-10 GenAI"],
    ).toContain("yes");
  });

  it("records a FrameworkVersion row from _meta.upstreamRef", async () => {
    await seedMindForge(FIXTURE);
    const v = await prisma.frameworkVersion.findFirst({
      where: { framework: "MINDFORGE" },
    });
    expect(v?.version).toBe("MindForge-2025-test");
  });
});
