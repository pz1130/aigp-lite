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
import { readFile, writeFile, unlink } from "node:fs/promises";
import { PrismaClient } from "@/lib/prisma";
import { seedFinosAigf } from "../../../prisma/seeds/finos-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "../../../tests/fixtures/finos/sample.json",
);
const TEST_FRAMEWORK_CODE = `FINOS_AIGF_TEST_${Date.now()}`;

let systemUserId: string;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: {
      email: `finos-importer-sys-${Date.now()}@x.test`,
      name: "FINOS importer test sys",
      passwordHash: "x",
    },
  });
  systemUserId = u.id;
});

afterAll(async () => {
  // FK order: links → controls → framework → catalog → user
  await prisma.riskCatalogMitigation.deleteMany({
    where: {
      OR: [
        { risk: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } } },
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
    where: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } },
  });
  await prisma.user.delete({ where: { id: systemUserId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.riskCatalogMitigation.deleteMany({
    where: {
      OR: [
        { risk: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } } },
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
    where: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } },
  });
});

describe("seedFinosAigf — framework + risks + mitigations", () => {
  it("creates the framework if missing", async () => {
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    const fw = await prisma.riskFramework.findUnique({
      where: { code: TEST_FRAMEWORK_CODE },
    });
    expect(fw).not.toBeNull();
    expect(fw?.name).toMatch(/FINOS/);
  });

  it("upserts all risks with full field shape", async () => {
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    const rows = await prisma.riskCatalog.findMany({
      where: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      source: "FINOS_AIGF",
      code: "ri-test-1",
      title: "Test Risk One",
      category: "SEC",
      orgId: null,
      sourceUrl: "https://example.invalid/risks/ri-test-1",
    });
    expect(rows[0].frameworkRefs).toEqual({ owaspLlm: ["llm01-2025"] });
    expect(rows[0].relatedRiskCodes).toEqual(["ri-test-2"]);
  });

  it("upserts all mitigations into the FINOS framework", async () => {
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    const rows = await prisma.riskControl.findMany({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      code: "mi-test-1",
      title: "Test Mitigation One",
      sourceUrl: "https://example.invalid/mitigations/mi-test-1",
    });
    expect(rows[0].frameworkRefs).toEqual({ iso42001: ["A-6-1-3"] });
  });
});

describe("seedFinosAigf — link rebuild + edge cases", () => {
  it("rebuilds 3 valid links and silently drops the dangling one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    const links = await prisma.riskCatalogMitigation.findMany({
      where: {
        risk: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } },
      },
    });
    expect(links).toHaveLength(3);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/mi-test-1.*ri-test-99/),
    );
    warn.mockRestore();
  });

  it("running seed twice does not duplicate rows", async () => {
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    const riskCount = await prisma.riskCatalog.count({
      where: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } },
    });
    const ctrlCount = await prisma.riskControl.count({
      where: { framework: { code: TEST_FRAMEWORK_CODE } },
    });
    const linkCount = await prisma.riskCatalogMitigation.count({
      where: {
        risk: { source: "FINOS_AIGF", code: { startsWith: "ri-test-" } },
      },
    });
    expect(riskCount).toBe(3);
    expect(ctrlCount).toBe(2);
    expect(linkCount).toBe(3);
  });

  it("re-seed with changed mitigatesRiskCodes deletes stale links", async () => {
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    const original = JSON.parse(await readFile(FIXTURE, "utf8"));
    const modified = structuredClone(original);
    modified.mitigations[0].mitigatesRiskCodes = ["ri-test-1"];
    const tmpPath = path.join(
      path.dirname(FIXTURE),
      `sample.modified.${Date.now()}.json`,
    );
    await writeFile(tmpPath, JSON.stringify(modified));
    try {
      await seedFinosAigf(systemUserId, tmpPath, {
        frameworkCode: TEST_FRAMEWORK_CODE,
      });
      const mi1Links = await prisma.riskCatalogMitigation.findMany({
        where: {
          control: {
            code: "mi-test-1",
            framework: { code: TEST_FRAMEWORK_CODE },
          },
        },
      });
      expect(mi1Links).toHaveLength(1);
    } finally {
      await unlink(tmpPath);
    }
  });

  it("does not delete links to custom-source risks", async () => {
    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });
    const org = await prisma.organization.create({
      data: { name: `finos-custom-test-${Date.now()}` },
    });
    const customRisk = await prisma.riskCatalog.create({
      data: {
        source: "custom",
        code: "custom-risk-1",
        title: "Custom risk",
        summary: "S",
        description: "D",
        orgId: org.id,
      },
    });
    const mi1 = await prisma.riskControl.findFirst({
      where: { code: "mi-test-1", framework: { code: TEST_FRAMEWORK_CODE } },
    });
    await prisma.riskCatalogMitigation.create({
      data: { riskCatalogId: customRisk.id, controlId: mi1!.id },
    });

    await seedFinosAigf(systemUserId, FIXTURE, {
      frameworkCode: TEST_FRAMEWORK_CODE,
    });

    const stillThere = await prisma.riskCatalogMitigation.findUnique({
      where: {
        riskCatalogId_controlId: {
          riskCatalogId: customRisk.id,
          controlId: mi1!.id,
        },
      },
    });
    expect(stillThere).not.toBeNull();

    // Cleanup
    await prisma.riskCatalogMitigation.delete({
      where: {
        riskCatalogId_controlId: {
          riskCatalogId: customRisk.id,
          controlId: mi1!.id,
        },
      },
    });
    await prisma.riskCatalog.delete({ where: { id: customRisk.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
