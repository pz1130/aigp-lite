import { describe, it, expect, afterAll, beforeEach } from "vitest";
import path from "node:path";
import { PrismaClient } from "@/lib/prisma";
import { seedFrontierRiskTierCatalog } from "./frontier-risk-tier-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "frontier-risk-tier",
  "sample.json",
);

async function cleanup() {
  // Thresholds cascade-delete with their category.
  await prisma.frtCategory.deleteMany({
    where: { code: { startsWith: "FRTTEST_" } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(cleanup);

describe("seedFrontierRiskTierCatalog", () => {
  it("upserts all categories and thresholds from the fixture", async () => {
    const res = await seedFrontierRiskTierCatalog(FIXTURE);
    expect(res).toEqual({ categories: 2, thresholds: 3 });

    const cats = await prisma.frtCategory.findMany({
      where: { code: { startsWith: "FRTTEST_" } },
      orderBy: { order: "asc" },
      include: { thresholds: { orderBy: [{ tier: "asc" }, { order: "asc" }] } },
    });
    expect(cats).toHaveLength(2);
    expect(cats[0]).toMatchObject({ code: "FRTTEST_A", title: "Test Cat A" });
    expect(cats[0].thresholds.map((t) => t.code)).toEqual([
      "FRT-FRTTEST_A-T1-1",
      "FRT-FRTTEST_A-T2-1",
    ]);
    expect(cats[0].thresholds[0].guidance).toBe("g1");
    expect(cats[1].thresholds).toHaveLength(1);
  });

  it("is idempotent across re-runs (no duplicate thresholds)", async () => {
    await seedFrontierRiskTierCatalog(FIXTURE);
    await seedFrontierRiskTierCatalog(FIXTURE);
    const count = await prisma.frtThreshold.count({
      where: { code: { startsWith: "FRT-FRTTEST_" } },
    });
    expect(count).toBe(3);
  });

  it("re-seed updates mutated fields in place", async () => {
    await seedFrontierRiskTierCatalog(FIXTURE);
    const before = await prisma.frtThreshold.findFirstOrThrow({
      where: { code: "FRT-FRTTEST_A-T1-1" },
    });
    await prisma.frtThreshold.update({
      where: { id: before.id },
      data: { statement: "STALE" },
    });
    await seedFrontierRiskTierCatalog(FIXTURE);
    const after = await prisma.frtThreshold.findFirstOrThrow({
      where: { code: "FRT-FRTTEST_A-T1-1" },
    });
    expect(after.id).toBe(before.id);
    expect(after.statement).toBe("Alpha one");
  });
});
