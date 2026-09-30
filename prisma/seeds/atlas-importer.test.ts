import { describe, it, expect, afterAll, beforeEach } from "vitest";
import path from "node:path";
import { PrismaClient } from "@/lib/prisma";
import { seedMitreAtlas } from "./atlas-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "atlas",
  "sample.json",
);

const TEST_FW = "ATLAS_TEST_FW";

async function cleanup() {
  await prisma.riskCatalog.deleteMany({
    where: { source: "MITRE_ATLAS", code: { startsWith: "atlas-test-" } },
  });
  await prisma.riskFramework.deleteMany({ where: { code: TEST_FW } });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(cleanup);

async function seedTestControlFramework() {
  const fw = await prisma.riskFramework.create({
    data: { code: TEST_FW, name: "ATLAS test framework", version: "test" },
  });
  await prisma.riskControl.createMany({
    data: [
      {
        frameworkId: fw.id,
        code: "mi-test-a",
        title: "Control A",
        description: "a",
      },
      {
        frameworkId: fw.id,
        code: "mi-test-b",
        title: "Control B",
        description: "b",
      },
    ],
  });
}

describe("seedMitreAtlas — risk-only catalog", () => {
  it("upserts all ATLAS risks with full field shape", async () => {
    await seedMitreAtlas(FIXTURE);
    const rows = await prisma.riskCatalog.findMany({
      where: { source: "MITRE_ATLAS", code: { startsWith: "atlas-test-" } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "MITRE_ATLAS",
      code: "atlas-test-1",
      title: "Test ATLAS Risk One",
      category: "Exfiltration",
      orgId: null,
      sourceUrl: "https://atlas.mitre.org/techniques/AML.T0024",
    });
    expect(rows[0].frameworkRefs).toEqual({
      mitreAtlas: ["AML.T0024.002"],
      owaspLlm: ["llm02-2025"],
    });
    expect(rows[0].relatedRiskCodes).toEqual(["ri-23"]);
  });

  it("running seed twice does not duplicate rows", async () => {
    await seedMitreAtlas(FIXTURE);
    await seedMitreAtlas(FIXTURE);
    const count = await prisma.riskCatalog.count({
      where: { source: "MITRE_ATLAS", code: { startsWith: "atlas-test-" } },
    });
    expect(count).toBe(2);
  });

  it("re-seed updates mutated fields in place", async () => {
    await seedMitreAtlas(FIXTURE);
    const before = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "MITRE_ATLAS", code: "atlas-test-1" },
    });
    await prisma.riskCatalog.update({
      where: { id: before.id },
      data: { title: "STALE" },
    });
    await seedMitreAtlas(FIXTURE);
    const after = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "MITRE_ATLAS", code: "atlas-test-1" },
    });
    expect(after.id).toBe(before.id);
    expect(after.title).toBe("Test ATLAS Risk One");
  });
});

describe("seedMitreAtlas — control links", () => {
  async function linksFor(code: string) {
    const risk = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "MITRE_ATLAS", code },
    });
    return prisma.riskCatalogMitigation.findMany({
      where: { riskCatalogId: risk.id },
      include: { control: { select: { code: true } } },
    });
  }

  it("links each ATLAS risk to known controls and skips unknown codes", async () => {
    await seedTestControlFramework();
    await seedMitreAtlas(FIXTURE, { controlFrameworkCode: TEST_FW });

    const one = await linksFor("atlas-test-1");
    // mi-test-a resolves; mi-test-bogus is skipped with a warning.
    expect(one.map((l) => l.control.code)).toEqual(["mi-test-a"]);

    const two = await linksFor("atlas-test-2");
    expect(two.map((l) => l.control.code)).toEqual(["mi-test-b"]);
  });

  it("re-seed does not duplicate links", async () => {
    await seedTestControlFramework();
    await seedMitreAtlas(FIXTURE, { controlFrameworkCode: TEST_FW });
    await seedMitreAtlas(FIXTURE, { controlFrameworkCode: TEST_FW });

    const one = await linksFor("atlas-test-1");
    expect(one).toHaveLength(1);
  });
});
