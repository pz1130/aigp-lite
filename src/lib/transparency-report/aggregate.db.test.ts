import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import {
  aggregateIncidents,
  aggregateDrift,
  buildSnapshot,
  resolveAggregation,
} from "./aggregate";
import { seedPortfolioOrg } from "./org-aggregate.db.test";

const TAG = "TXR-AGG-" + Date.now();

async function cleanup() {
  await prisma.incident.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.driftRun.deleteMany({ where: { targetModel: TAG } });
  await prisma.driftBenchmark.deleteMany({ where: { name: TAG } });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("txr aggregators", () => {
  it("buckets incidents opened in the period by severity and category", async () => {
    const org = await prisma.organization.create({ data: { name: TAG } });
    const opener = await prisma.user.create({
      data: {
        email: `agg-${Date.now()}@t.local`,
        name: "O",
        passwordHash: "x",
      },
    });
    await prisma.incident.create({
      data: {
        orgId: org.id,
        title: TAG + " a",
        severity: "high",
        category: "data_leak",
        openedAt: new Date("2026-03-01"),
        openedById: opener.id,
      },
    });
    await prisma.incident.create({
      data: {
        orgId: org.id,
        title: TAG + " b",
        severity: "critical",
        openedAt: new Date("2026-03-02"),
        openedById: opener.id,
      },
    });
    await prisma.incident.create({
      data: {
        orgId: org.id,
        title: TAG + " c",
        severity: "low",
        category: "data_leak",
        openedAt: new Date("2025-12-31"),
        openedById: opener.id,
      },
    });

    const db = withOrg(prisma, org.id);
    const inc = await aggregateIncidents(
      db,
      org.id,
      null,
      new Date("2026-01-01"),
      new Date("2026-06-30"),
    );
    expect(inc.total).toBe(2);
    expect(inc.bySeverity).toEqual({ low: 0, medium: 0, high: 1, critical: 1 });
    expect(inc.byCategory).toEqual({ data_leak: 1, uncategorized: 1 });
  });

  it("reports the latest completed drift run and counts runs in period", async () => {
    const org = await prisma.organization.create({
      data: { name: TAG + "-drift" },
    });
    const creator = await prisma.user.create({
      data: {
        email: `aggd-${Date.now()}@t.local`,
        name: "D",
        passwordHash: "x",
      },
    });
    const bench = await prisma.driftBenchmark.create({
      data: { orgId: org.id, name: TAG, createdById: creator.id },
    });
    await prisma.driftRun.create({
      data: {
        orgId: org.id,
        benchmarkId: bench.id,
        targetProvider: "p",
        targetModel: TAG,
        judgeModel: "j",
        status: "completed",
        avgScore: 8.5,
        degraded: false,
        promptCount: 1,
        startedAt: new Date("2026-02-01"),
        completedAt: new Date("2026-02-01"),
      },
    });
    await prisma.driftRun.create({
      data: {
        orgId: org.id,
        benchmarkId: bench.id,
        targetProvider: "p",
        targetModel: TAG,
        judgeModel: "j",
        status: "completed",
        avgScore: 4.0,
        degraded: true,
        promptCount: 1,
        startedAt: new Date("2026-04-01"),
        completedAt: new Date("2026-04-01"),
      },
    });

    const db = withOrg(prisma, org.id);
    const drift = await aggregateDrift(
      db,
      org.id,
      new Date("2026-01-01"),
      new Date("2026-06-30"),
    );
    expect(drift.latestRun?.avgScore).toBe(4.0);
    expect(drift.runsInPeriod).toBe(2);
    expect(drift.degradedRunsInPeriod).toBe(1);
  });

  it("buildSnapshot composes all blocks with no approved FRT", async () => {
    const org = await prisma.organization.create({
      data: { name: TAG + "-snap" },
    });
    const db = withOrg(prisma, org.id);
    const snap = await buildSnapshot(
      db,
      {
        orgId: org.id,
        usecaseId: null,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-06-30"),
      },
      null,
    );
    expect(snap.frt.found).toBe(false);
    expect(snap.frt.overallTier).toBe(0);
    expect(snap.tierDeltas.priorEdition).toBeNull();
    expect(typeof snap.posture.score).toBe("number");
    expect(snap.generatedAt).toBeTruthy();
  });

  it("resolveAggregation returns a portfolio snapshot for a null-scope report", async () => {
    const { orgId } = await seedPortfolioOrg();
    const db = withOrg(prisma, orgId);
    const result = await resolveAggregation(db, {
      orgId,
      usecaseId: null,
      status: "draft",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-06-30"),
      snapshot: null,
    });
    expect("portfolio" in result).toBe(true);
  });
});
