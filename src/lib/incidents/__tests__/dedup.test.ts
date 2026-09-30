import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { suggestDuplicates } from "../dedup";
import * as embedMod from "../embed";
import { SYSTEM_USER_ID } from "@/lib/auth/system-user";

const ORG = "org-dedup-test";

async function freshOrg() {
  await prisma.incidentMergeSuggestion.deleteMany({ where: { orgId: ORG } });
  await prisma.incident.deleteMany({ where: { orgId: ORG } });
  await prisma.orgIncidentAutomationConfig.deleteMany({
    where: { orgId: ORG },
  });
  await prisma.organization.deleteMany({ where: { id: ORG } });
  await prisma.organization.create({ data: { id: ORG, name: "T" } });
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    create: {
      id: SYSTEM_USER_ID,
      email: "system@internal",
      name: "System",
      passwordHash: "x",
    },
    update: {},
  });
}

async function mkIncident(title: string, embedding: number[] | null) {
  return prisma.incident.create({
    data: {
      orgId: ORG,
      title,
      openedById: SYSTEM_USER_ID,
      embedding: embedding as unknown as object,
    },
  });
}

beforeEach(freshOrg);

describe("suggestDuplicates", () => {
  it("short-circuits and returns [] when no embedding provider is available", async () => {
    vi.spyOn(embedMod, "embedText").mockResolvedValue(null);
    const i = await mkIncident("first", null);
    const r = await suggestDuplicates(i.id);
    expect(r).toEqual([]);
  });

  it("upserts suggestions for candidates above the threshold (default 0.85)", async () => {
    await mkIncident("similar one", [1, 0, 0]);
    vi.spyOn(embedMod, "embedText").mockResolvedValue([0.99, 0.01, 0]);
    const fresh = await mkIncident("new arrival", null);

    const out = await suggestDuplicates(fresh.id);
    expect(out.length).toBe(1);
    expect(out[0].similarity).toBeGreaterThan(0.85);

    const stored = await prisma.incidentMergeSuggestion.findMany({
      where: { incidentId: fresh.id },
    });
    expect(stored.length).toBe(1);
  });

  it("excludes closed and merged candidates", async () => {
    const c1 = await mkIncident("closed one", [1, 0, 0]);
    await prisma.incident.update({
      where: { id: c1.id },
      data: { status: "closed", closedAt: new Date() },
    });
    const c2 = await mkIncident("merged one", [1, 0, 0]);
    await prisma.incident.update({
      where: { id: c2.id },
      data: { mergedIntoId: c1.id },
    });

    vi.spyOn(embedMod, "embedText").mockResolvedValue([1, 0, 0]);
    const fresh = await mkIncident("new", null);
    const out = await suggestDuplicates(fresh.id);
    expect(out).toEqual([]);
  });

  it("trims to top 3", async () => {
    for (let i = 0; i < 5; i++) await mkIncident(`cand-${i}`, [1, 0, 0]);
    vi.spyOn(embedMod, "embedText").mockResolvedValue([1, 0, 0]);
    const fresh = await mkIncident("new", null);
    const out = await suggestDuplicates(fresh.id);
    expect(out.length).toBe(3);
  });

  it("is idempotent (re-running upserts the same rows)", async () => {
    await mkIncident("similar", [1, 0, 0]);
    vi.spyOn(embedMod, "embedText").mockResolvedValue([1, 0, 0]);
    const fresh = await mkIncident("new", null);
    await suggestDuplicates(fresh.id);
    await suggestDuplicates(fresh.id);
    const all = await prisma.incidentMergeSuggestion.findMany({
      where: { incidentId: fresh.id },
    });
    expect(all.length).toBe(1);
  });

  it("respects org dedupEnabled=false", async () => {
    await prisma.orgIncidentAutomationConfig.create({
      data: { orgId: ORG, dedupEnabled: false },
    });
    await mkIncident("similar", [1, 0, 0]);
    vi.spyOn(embedMod, "embedText").mockResolvedValue([1, 0, 0]);
    const fresh = await mkIncident("new", null);
    expect(await suggestDuplicates(fresh.id)).toEqual([]);
  });
});
