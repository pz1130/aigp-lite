import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedAgenticGovernanceCatalog } from "./agentic-governance-importer";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seedAgenticGovernanceCatalog", () => {
  it("imports 7 sections and 28 items idempotently", async () => {
    const first = await seedAgenticGovernanceCatalog();
    expect(first).toEqual({ sections: 7, items: 28 });

    // Re-running upserts, not duplicates.
    const second = await seedAgenticGovernanceCatalog();
    expect(second).toEqual({ sections: 7, items: 28 });

    const sectionCount = await prisma.agChkSection.count();
    const itemCount = await prisma.agChkItem.count();
    expect(sectionCount).toBe(7);
    expect(itemCount).toBe(28);

    const ag1 = await prisma.agChkSection.findUnique({
      where: { num: 1 },
      include: { items: { orderBy: { order: "asc" } } },
    });
    expect(ag1?.key).toBe("ag1-tool-access");
    expect(ag1?.items.map((i) => i.code)).toEqual([
      "AG1-01",
      "AG1-02",
      "AG1-03",
      "AG1-04",
    ]);
    expect(Array.isArray(ag1?.seeAlso)).toBe(true);
  });
});
