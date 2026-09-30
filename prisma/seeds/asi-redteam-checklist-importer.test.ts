import { describe, it, expect, afterAll, beforeEach } from "vitest";
import path from "node:path";
import { PrismaClient } from "@/lib/prisma";
import { seedAsiRedteamChecklistCatalog } from "./asi-redteam-checklist-importer";

const prisma = new PrismaClient();
const FIXTURE = path.resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "asi-redteam-checklist",
  "sample.json",
);

async function cleanup() {
  // Items cascade-delete with their section.
  await prisma.asiChkSection.deleteMany({
    where: { key: { startsWith: "asi-test-" } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(cleanup);

describe("seedAsiRedteamChecklistCatalog", () => {
  it("upserts all sections and items from the fixture", async () => {
    const res = await seedAsiRedteamChecklistCatalog(FIXTURE);
    expect(res).toEqual({ sections: 2, items: 3 });

    const sections = await prisma.asiChkSection.findMany({
      where: { key: { startsWith: "asi-test-" } },
      orderBy: { order: "asc" },
      include: { items: { orderBy: { order: "asc" } } },
    });
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      num: 901,
      key: "asi-test-a",
      asiCode: "asi-test-1",
      title: "Test Section A",
    });
    expect(sections[0].items.map((i) => i.code)).toEqual([
      "ASITESTA-T1",
      "ASITESTA-T2",
    ]);
    expect(sections[0].items[0].guidance).toBe("g1");
    expect(sections[1].items).toHaveLength(1);
  });

  it("is idempotent across re-runs (no duplicate items)", async () => {
    await seedAsiRedteamChecklistCatalog(FIXTURE);
    await seedAsiRedteamChecklistCatalog(FIXTURE);
    const count = await prisma.asiChkItem.count({
      where: { code: { startsWith: "ASITEST" } },
    });
    expect(count).toBe(3);
  });

  it("re-seed updates mutated fields in place", async () => {
    await seedAsiRedteamChecklistCatalog(FIXTURE);
    const before = await prisma.asiChkItem.findFirstOrThrow({
      where: { code: "ASITESTA-T1" },
    });
    await prisma.asiChkItem.update({
      where: { id: before.id },
      data: { text: "STALE" },
    });
    await seedAsiRedteamChecklistCatalog(FIXTURE);
    const after = await prisma.asiChkItem.findFirstOrThrow({
      where: { code: "ASITESTA-T1" },
    });
    expect(after.id).toBe(before.id);
    expect(after.text).toBe("Attempt one");
  });
});
