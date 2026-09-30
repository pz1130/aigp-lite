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
import { seedIso42001 } from "./iso42001-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "iso42001",
  "sample.json",
);
const TEST_FRAMEWORK_CODE = `ISO_42001_TEST_${Date.now()}`;
const SOURCE = "ISO_42001" as const;

const cleanup = async () => {
  // FK order: links → controls → framework → catalog
  await prisma.riskCatalogMitigation.deleteMany({
    where: {
      OR: [
        { risk: { source: SOURCE, code: { startsWith: "iso-test-" } } },
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
    where: { source: SOURCE, code: { startsWith: "iso-test-" } },
  });
};

beforeAll(cleanup);
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const seed = () =>
  seedIso42001(FIXTURE, { frameworkCode: TEST_FRAMEWORK_CODE, source: SOURCE });

describe("seedIso42001 — framework + risks + controls", () => {
  it("creates the framework if missing", async () => {
    await seed();
    const fw = await prisma.riskFramework.findUnique({
      where: { code: TEST_FRAMEWORK_CODE },
    });
    expect(fw).not.toBeNull();
    expect(fw?.name).toMatch(/ISO/);
  });

  it("upserts all risks with full field shape", async () => {
    await seed();
    const rows = await prisma.riskCatalog.findMany({
      where: { source: SOURCE, code: { startsWith: "iso-test-" } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: SOURCE,
      code: "iso-test-r1",
      title: "Test Risk One",
      category: "DATA",
      orgId: null,
      sourceUrl: "https://example.invalid/iso/r1",
    });
    expect(rows[0].frameworkRefs).toEqual({ nistAiRmf: ["nist-harm-people"] });
    expect(rows[0].relatedRiskCodes).toEqual(["iso-test-r2"]);
  });

  it("upserts all Annex A controls into the ISO framework", async () => {
    await seed();
    const rows = await prisma.riskControl.findMany({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.code).sort()).toEqual([
      "TEST-A.2.2",
      "TEST-A.6.2.4",
    ]);
  });
});

describe("seedIso42001 — link rebuild + idempotency", () => {
  it("rebuilds valid links and silently drops the dangling one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await seed();
    expect(result.links).toBe(2);
    const links = await prisma.riskCatalogMitigation.findMany({
      where: { risk: { source: SOURCE, code: { startsWith: "iso-test-" } } },
    });
    expect(links).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/TEST-A\.2\.2.*iso-test-r99/),
    );
    warn.mockRestore();
  });

  it("running seed twice does not duplicate rows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seed();
    await seed();
    const riskCount = await prisma.riskCatalog.count({
      where: { source: SOURCE, code: { startsWith: "iso-test-" } },
    });
    const ctrlCount = await prisma.riskControl.count({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
    });
    const linkCount = await prisma.riskCatalogMitigation.count({
      where: { risk: { source: SOURCE, code: { startsWith: "iso-test-" } } },
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
