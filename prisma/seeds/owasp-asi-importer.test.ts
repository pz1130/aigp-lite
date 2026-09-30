import { describe, it, expect, afterAll, beforeEach } from "vitest";
import path from "node:path";
import { PrismaClient } from "@/lib/prisma";
import { seedOwaspAsi } from "./owasp-asi-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "owasp-asi",
  "sample.json",
);

const TEST_FW = "ASI_TEST_FW";

async function cleanup() {
  await prisma.riskCatalog.deleteMany({
    where: { source: "OWASP_ASI", code: { startsWith: "asi-test-" } },
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
    data: { code: TEST_FW, name: "ASI test framework", version: "test" },
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

describe("seedOwaspAsi — risk-only catalog", () => {
  it("upserts all ASI risks with full field shape", async () => {
    await seedOwaspAsi(FIXTURE);
    const rows = await prisma.riskCatalog.findMany({
      where: { source: "OWASP_ASI", code: { startsWith: "asi-test-" } },
      orderBy: { code: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "OWASP_ASI",
      code: "asi-test-1",
      title: "Test ASI Risk One",
      category: "AGENTIC",
      orgId: null,
      sourceUrl:
        "https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications/",
    });
    expect(rows[0].frameworkRefs).toEqual({
      owaspLlmTop10: ["LLM01"],
      agenticThreats: ["T6"],
    });
    expect(rows[0].relatedRiskCodes).toEqual(["atlas-1"]);
  });

  it("running seed twice does not duplicate rows", async () => {
    await seedOwaspAsi(FIXTURE);
    await seedOwaspAsi(FIXTURE);
    const count = await prisma.riskCatalog.count({
      where: { source: "OWASP_ASI", code: { startsWith: "asi-test-" } },
    });
    expect(count).toBe(2);
  });

  it("re-seed updates mutated fields in place", async () => {
    await seedOwaspAsi(FIXTURE);
    const before = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "OWASP_ASI", code: "asi-test-1" },
    });
    await prisma.riskCatalog.update({
      where: { id: before.id },
      data: { title: "STALE" },
    });
    await seedOwaspAsi(FIXTURE);
    const after = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "OWASP_ASI", code: "asi-test-1" },
    });
    expect(after.id).toBe(before.id);
    expect(after.title).toBe("Test ASI Risk One");
  });
});

describe("seedOwaspAsi — control links", () => {
  async function linksFor(code: string) {
    const risk = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "OWASP_ASI", code },
    });
    return prisma.riskCatalogMitigation.findMany({
      where: { riskCatalogId: risk.id },
      include: { control: { select: { code: true } } },
    });
  }

  it("links each ASI risk to known controls and skips unknown codes", async () => {
    await seedTestControlFramework();
    await seedOwaspAsi(FIXTURE, { controlFrameworkCode: TEST_FW });

    const one = await linksFor("asi-test-1");
    // mi-test-a resolves; mi-test-bogus is skipped with a warning.
    expect(one.map((l) => l.control.code)).toEqual(["mi-test-a"]);

    const two = await linksFor("asi-test-2");
    expect(two.map((l) => l.control.code)).toEqual(["mi-test-b"]);
  });

  it("re-seed does not duplicate links", async () => {
    await seedTestControlFramework();
    await seedOwaspAsi(FIXTURE, { controlFrameworkCode: TEST_FW });
    await seedOwaspAsi(FIXTURE, { controlFrameworkCode: TEST_FW });

    const one = await linksFor("asi-test-1");
    expect(one).toHaveLength(1);
  });
});
