import { describe, it, expect, afterAll, beforeEach } from "vitest";
import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { PrismaClient } from "@/lib/prisma";
import { backfillAtlasRefs } from "./backfill-refs";

const prisma = new PrismaClient();
const CODE = "ri-atlas-bf-test";
const tmpPath = path.resolve(__dirname, `bf.fixture.${Date.now()}.json`);

const fixture = {
  risks: [
    {
      code: CODE,
      frameworkRefs: { owaspLlm: ["llm01-2025"], mitreAtlas: ["AML.T0051"] },
    },
    {
      code: "ri-atlas-bf-noatlas",
      frameworkRefs: { owaspLlm: ["llm09-2025"] },
    },
  ],
};

async function cleanup() {
  await prisma.riskCatalog.deleteMany({
    where: { source: "FINOS_AIGF", code: { startsWith: "ri-atlas-bf-test" } },
  });
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await unlink(tmpPath).catch(() => {});
  await prisma.$disconnect();
});

describe("backfillAtlasRefs", () => {
  it("merges mitreAtlas into existing row, preserving other ref keys; idempotent", async () => {
    await writeFile(tmpPath, JSON.stringify(fixture));
    await prisma.riskCatalog.create({
      data: {
        source: "FINOS_AIGF",
        code: CODE,
        orgId: null,
        title: "BF test",
        summary: "s",
        description: "d",
        frameworkRefs: { owaspLlm: ["llm01-2025"] },
      },
    });

    const first = await backfillAtlasRefs(tmpPath);
    expect(first.updated).toBe(1);

    const row = await prisma.riskCatalog.findFirstOrThrow({
      where: { source: "FINOS_AIGF", code: CODE, orgId: null },
    });
    expect(row.frameworkRefs).toEqual({
      owaspLlm: ["llm01-2025"],
      mitreAtlas: ["AML.T0051"],
    });

    // Second run is a no-op.
    const second = await backfillAtlasRefs(tmpPath);
    expect(second.updated).toBe(0);
  });

  it("does not fail when a JSON risk has no DB row", async () => {
    await writeFile(tmpPath, JSON.stringify(fixture));
    const res = await backfillAtlasRefs(tmpPath);
    expect(res.updated).toBe(0); // row absent -> skipped, no throw
  });
});
