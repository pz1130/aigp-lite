import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { seedAlignmentProbes, SEED_PROBES } from "./seed";
import { ALIGNMENT_DIMENSIONS } from "./config";

describe("seedAlignmentProbes", () => {
  it("covers all 8 dimensions with non-empty rubric text", () => {
    expect(SEED_PROBES).toHaveLength(8);
    const dims = SEED_PROBES.map((p) => p.dimension).sort();
    expect(dims).toEqual([...ALIGNMENT_DIMENSIONS].sort());
    for (const p of SEED_PROBES) {
      expect(p.promptText.trim().length).toBeGreaterThan(0);
      expect(p.expectedBehavior.trim().length).toBeGreaterThan(0);
      expect(p.concernGuidance.trim().length).toBeGreaterThan(0);
    }
  });

  it("upserts probes idempotently and records a framework version", async () => {
    const n1 = await seedAlignmentProbes();
    expect(n1).toBe(8);
    const n2 = await seedAlignmentProbes();
    expect(n2).toBe(8);
    const total = await prisma.alignmentProbe.count();
    expect(total).toBeGreaterThanOrEqual(8);
    const fv = await prisma.frameworkVersion.findUnique({
      where: { framework: "ALIGNMENT_AUDIT" },
    });
    expect(fv?.itemCount).toBe(8);
  });
});
