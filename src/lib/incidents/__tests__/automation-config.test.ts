import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getOrgAutomationConfig } from "../automation-config";

const ORG = "org-cfg-test";

beforeEach(async () => {
  await prisma.orgIncidentAutomationConfig.deleteMany({
    where: { orgId: ORG },
  });
  await prisma.organization.deleteMany({ where: { id: ORG } });
  await prisma.organization.create({ data: { id: ORG, name: "T" } });
});

describe("getOrgAutomationConfig", () => {
  it("creates a row with defaults if none exists", async () => {
    const cfg = await getOrgAutomationConfig(ORG);
    expect(cfg.autoOpenEnabled).toBe(true);
    expect(cfg.blockAlwaysOpens).toBe(true);
    expect(cfg.hitBurstThreshold).toBe(5);
    expect(cfg.hitBurstWindowMin).toBe(10);
    expect(cfg.dedupEnabled).toBe(true);
    expect(cfg.dedupSimilarityThreshold).toBeCloseTo(0.85);
    expect(cfg.dedupLookbackDays).toBe(30);
  });

  it("returns the existing row when it exists", async () => {
    await prisma.orgIncidentAutomationConfig.create({
      data: {
        orgId: ORG,
        autoOpenEnabled: false,
        dedupSimilarityThreshold: 0.7,
      },
    });
    const cfg = await getOrgAutomationConfig(ORG);
    expect(cfg.autoOpenEnabled).toBe(false);
    expect(cfg.dedupSimilarityThreshold).toBeCloseTo(0.7);
  });
});
