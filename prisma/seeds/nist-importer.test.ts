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
import { seedNistAiRmf } from "./nist-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "nist",
  "sample.json",
);
const TEST_FRAMEWORK_CODE = `NIST_AI_RMF_TEST_${Date.now()}`;
const SOURCE = "NIST_AI_RMF" as const;

const cleanup = async () => {
  // FK order: links → controls → framework → catalog
  await prisma.riskCatalogMitigation.deleteMany({
    where: {
      OR: [
        { risk: { source: SOURCE, code: { startsWith: "nist-test-" } } },
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
    where: { source: SOURCE, code: { startsWith: "nist-test-" } },
  });
};

beforeAll(cleanup);
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const seed = () =>
  seedNistAiRmf(FIXTURE, {
    frameworkCode: TEST_FRAMEWORK_CODE,
    source: SOURCE,
  });

describe("seedNistAiRmf — framework + risks + controls", () => {
  it("creates the framework if missing", async () => {
    await seed();
    const fw = await prisma.riskFramework.findUnique({
      where: { code: TEST_FRAMEWORK_CODE },
    });
    expect(fw).not.toBeNull();
    expect(fw?.name).toMatch(/NIST/);
  });

  it("upserts all harm risks with full field shape", async () => {
    await seed();
    const rows = await prisma.riskCatalog.findMany({
      where: { source: SOURCE, code: { startsWith: "nist-test-" } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: SOURCE,
      code: "nist-test-r1",
      title: "Test Harm One",
      category: "HARM",
      orgId: null,
      sourceUrl: "https://example.invalid/nist/r1",
    });
    expect(rows[0].frameworkRefs).toEqual({ finosAigf: ["ri-16"] });
    expect(rows[0].relatedRiskCodes).toEqual(["nist-test-r2"]);
  });

  it("upserts all controls into the NIST framework", async () => {
    await seed();
    const rows = await prisma.riskControl.findMany({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.code).sort()).toEqual([
      "TEST-GOVERN-1.1",
      "TEST-MANAGE-1.3",
    ]);
  });
});

describe("seedNistAiRmf — link rebuild + idempotency", () => {
  it("rebuilds valid links and silently drops the dangling one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await seed();
    expect(result.links).toBe(2);
    const links = await prisma.riskCatalogMitigation.findMany({
      where: { risk: { source: SOURCE, code: { startsWith: "nist-test-" } } },
    });
    expect(links).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/TEST-GOVERN-1\.1.*nist-test-r99/),
    );
    warn.mockRestore();
  });

  it("running seed twice does not duplicate rows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seed();
    await seed();
    const riskCount = await prisma.riskCatalog.count({
      where: { source: SOURCE, code: { startsWith: "nist-test-" } },
    });
    const ctrlCount = await prisma.riskControl.count({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
    });
    const linkCount = await prisma.riskCatalogMitigation.count({
      where: { risk: { source: SOURCE, code: { startsWith: "nist-test-" } } },
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
