import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import path from "node:path";
import { PrismaClient } from "@/lib/prisma";
import { seedEuAiAct } from "./eu-ai-act-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "eu-ai-act",
  "sample.json",
);
const TEST_FRAMEWORK_CODE = `EU_AI_ACT_TEST_${Date.now()}`;
const SOURCE = "EU_AI_ACT" as const;

const cleanup = async () => {
  // FK order: links → controls → framework → catalog
  await prisma.riskCatalogMitigation.deleteMany({
    where: {
      OR: [
        { risk: { source: SOURCE, code: { startsWith: "eu-test-" } } },
        { control: { framework: { code: TEST_FRAMEWORK_CODE } } },
      ],
    },
  });
  await prisma.riskControl.deleteMany({
    where: { framework: { code: TEST_FRAMEWORK_CODE } },
  });
  await prisma.riskFramework.deleteMany({
    where: { code: TEST_FRAMEWORK_CODE },
  });
  await prisma.riskCatalog.deleteMany({
    where: { source: SOURCE, code: { startsWith: "eu-test-" } },
  });
};

beforeAll(cleanup);
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const seed = () =>
  seedEuAiAct(FIXTURE, { frameworkCode: TEST_FRAMEWORK_CODE, source: SOURCE });

describe("seedEuAiAct — framework + risks + obligations", () => {
  it("creates the framework if missing", async () => {
    await seed();
    const fw = await prisma.riskFramework.findUnique({
      where: { code: TEST_FRAMEWORK_CODE },
    });
    expect(fw).not.toBeNull();
    expect(fw?.name).toMatch(/Artificial Intelligence Act/);
  });

  it("upserts all risks with full field shape", async () => {
    await seed();
    const rows = await prisma.riskCatalog.findMany({
      where: { source: SOURCE, code: { startsWith: "eu-test-" } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: SOURCE,
      code: "eu-test-r1",
      title: "Test High-Risk One",
      category: "HIGH_RISK",
      orgId: null,
      sourceUrl: "https://example.invalid/eu/r1",
    });
    expect(rows[0].frameworkRefs).toEqual({ finosAigf: ["ri-16"] });
    expect(rows[0].relatedRiskCodes).toEqual(["eu-test-r2"]);
  });

  it("upserts all obligations into the EU AI Act framework", async () => {
    await seed();
    const rows = await prisma.riskControl.findMany({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.code).sort()).toEqual([
      "ART-TEST-10",
      "ART-TEST-9",
    ]);
  });
});

describe("seedEuAiAct — link rebuild + idempotency", () => {
  it("rebuilds valid links and silently drops the dangling one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await seed();
    expect(result.links).toBe(2);
    const links = await prisma.riskCatalogMitigation.findMany({
      where: { risk: { source: SOURCE, code: { startsWith: "eu-test-" } } },
    });
    expect(links).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/ART-TEST-9.*eu-test-r99/),
    );
    warn.mockRestore();
  });

  it("running seed twice does not duplicate rows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seed();
    await seed();
    const riskCount = await prisma.riskCatalog.count({
      where: { source: SOURCE, code: { startsWith: "eu-test-" } },
    });
    const ctrlCount = await prisma.riskControl.count({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
    });
    const linkCount = await prisma.riskCatalogMitigation.count({
      where: { risk: { source: SOURCE, code: { startsWith: "eu-test-" } } },
    });
    expect(riskCount).toBe(2);
    expect(ctrlCount).toBe(2);
    expect(linkCount).toBe(2);
  });

  it("records a framework_version row", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seed();
    const v = await prisma.frameworkVersion.findFirst({
      where: { framework: SOURCE },
    });
    expect(v).not.toBeNull();
    expect(v?.itemCount).toBeGreaterThan(0);
  });
});
