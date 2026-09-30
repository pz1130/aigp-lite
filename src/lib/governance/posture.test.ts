import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const makeCount = (val = 0) => vi.fn().mockResolvedValue(val);
  const makeFindMany = (val: unknown[] = []) => vi.fn().mockResolvedValue(val);
  return {
    usecaseControlStatus: { count: makeCount(), findMany: makeFindMany() },
    incident: { count: makeCount(), findMany: makeFindMany() },
    driftRun: { findMany: makeFindMany() },
    budget: { findMany: makeFindMany() },
    llmInvocation: { findMany: makeFindMany() },
    aiUsecase: { findMany: makeFindMany() },
    usecaseMateriality: { findMany: makeFindMany() },
    vendor: { findMany: makeFindMany() },
    vendorUsecaseLink: { findMany: makeFindMany() },
  };
});
vi.mock("@/lib/db", () => ({ prisma: db }));

beforeEach(() => vi.clearAllMocks());

describe("computePosture", () => {
  it("returns a neutral payload for an empty org (no divide-by-zero)", async () => {
    db.usecaseControlStatus.count.mockResolvedValue(0);
    db.usecaseControlStatus.findMany.mockResolvedValue([]);
    db.aiUsecase.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.dimensions).toHaveLength(5);
    expect(result.usecases).toEqual([]);
  });

  it("controls dimension is a tier-weighted average of per-usecase control scores", async () => {
    db.aiUsecase.findMany.mockResolvedValue([
      { id: "uc-min", name: "minimal tool" },
      { id: "uc-crit", name: "critical system" },
    ]);
    db.usecaseControlStatus.findMany.mockResolvedValue([
      { usecaseId: "uc-min", status: "satisfied" },
      { usecaseId: "uc-min", status: "satisfied" },
      { usecaseId: "uc-crit", status: "failed" },
      { usecaseId: "uc-crit", status: "failed" },
    ]);
    db.usecaseMateriality.findMany.mockResolvedValue([
      { usecaseId: "uc-min", computedTier: "minimal", tierOverride: null },
      { usecaseId: "uc-crit", computedTier: "critical", tierOverride: null },
    ]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);

    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");
    const controls = result.dimensions.find((d) => d.key === "controls")!;
    expect(controls.score).toBe(11);
  });

  it("ungraded use cases default to 'limited' weight and are flagged", async () => {
    db.aiUsecase.findMany.mockResolvedValue([{ id: "uc-x", name: "ungraded" }]);
    db.usecaseControlStatus.findMany.mockResolvedValue([
      { usecaseId: "uc-x", status: "satisfied" },
      { usecaseId: "uc-x", status: "failed" },
    ]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);

    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");
    const controls = result.dimensions.find((d) => d.key === "controls")!;
    expect(controls.score).toBe(50);
    expect(controls.raw.ungraded).toBe(1);
    expect(
      result.usecases.find((u) => u.usecaseId === "uc-x")!.effectiveTier,
    ).toBeNull();
  });

  it("equal-weight (all ungraded) reduces to a plain average", async () => {
    db.aiUsecase.findMany.mockResolvedValue([
      { id: "a", name: "a" },
      { id: "b", name: "b" },
    ]);
    db.usecaseControlStatus.findMany.mockResolvedValue([
      { usecaseId: "a", status: "satisfied" },
      { usecaseId: "b", status: "failed" },
    ]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);

    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");
    const controls = result.dimensions.find((d) => d.key === "controls")!;
    expect(controls.score).toBe(50);
  });

  it("no in-scope use cases -> controls score 100 (empty dimension)", async () => {
    db.aiUsecase.findMany.mockResolvedValue([]);
    db.usecaseControlStatus.findMany.mockResolvedValue([]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);

    const { computePosture, POSTURE_WEIGHTS } = await import("./posture");
    expect(POSTURE_WEIGHTS).toEqual({
      controls: 0.35,
      incidents: 0.2,
      drift: 0.15,
      budget: 0.1,
      vendor: 0.2,
    });
    const result = await computePosture(db as never, "org-1");
    const controls = result.dimensions.find((d) => d.key === "controls")!;
    expect(controls.score).toBe(100);
    expect(result.score).toBe(85);
  });

  it("computes incident counts by severity and SLA breaches", async () => {
    db.usecaseControlStatus.count.mockResolvedValue(0);
    db.aiUsecase.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([
      {
        id: "i1",
        severity: "critical",
        status: "open",
        relatedUsecaseId: null,
        slaDeadline: new Date(Date.now() - 1000),
        title: "test",
      },
      {
        id: "i2",
        severity: "high",
        status: "open",
        relatedUsecaseId: null,
        slaDeadline: null,
        title: "test2",
      },
    ]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    db.usecaseControlStatus.findMany.mockResolvedValue([]);

    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");

    const incidents = result.dimensions.find((d) => d.key === "incidents")!;
    expect(incidents.raw.openCount).toBe(2);
    expect(incidents.raw.breachCount).toBe(1);
    const raw = incidents.raw as {
      openCount: number;
      breachCount: number;
      bySeverity: Record<string, number>;
    };
    expect(raw.bySeverity.critical).toBe(1);
    expect(raw.bySeverity.high).toBe(1);
  });

  it("computes drift health from latest runs (green vs degraded)", async () => {
    db.usecaseControlStatus.count.mockResolvedValue(0);
    db.aiUsecase.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([
      {
        id: "dr1",
        benchmarkId: "b1",
        status: "completed",
        degraded: true,
        startedAt: new Date(),
      },
      {
        id: "dr2",
        benchmarkId: "b1",
        status: "completed",
        degraded: false,
        startedAt: new Date(Date.now() - 1000),
      },
      {
        id: "dr3",
        benchmarkId: "b2",
        status: "completed",
        degraded: false,
        startedAt: new Date(),
      },
    ]);
    db.budget.findMany.mockResolvedValue([]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    db.usecaseControlStatus.findMany.mockResolvedValue([]);

    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");

    const drift = result.dimensions.find((d) => d.key === "drift")!;
    expect(drift.raw.totalBenchmarks).toBe(2);
    expect(drift.raw.degradedCount).toBe(1);
  });

  it("exposes the weighting breakdown so the UI can show 'why this score'", async () => {
    db.usecaseControlStatus.count.mockResolvedValue(0);
    db.aiUsecase.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    db.usecaseControlStatus.findMany.mockResolvedValue([]);

    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");
    for (const d of result.dimensions) {
      expect(d.weight).toBeGreaterThan(0);
      expect(typeof d.score).toBe("number");
    }
  });

  it("vendor dimension averages effective ratings over relied-on vendors", async () => {
    db.aiUsecase.findMany.mockResolvedValue([{ id: "uc-1", name: "uc" }]);
    db.usecaseControlStatus.findMany.mockResolvedValue([]);
    db.usecaseMateriality.findMany.mockResolvedValue([]);
    db.incident.findMany.mockResolvedValue([]);
    db.driftRun.findMany.mockResolvedValue([]);
    db.budget.findMany.mockResolvedValue([]);
    db.vendorUsecaseLink.findMany.mockResolvedValue([
      { vendorId: "v-low" },
      { vendorId: "v-crit" },
    ]);
    db.vendor.findMany.mockResolvedValue([
      { id: "v-low", computedRating: "low", ratingOverride: null },
      { id: "v-crit", computedRating: "critical", ratingOverride: null },
    ]);

    const { computePosture } = await import("./posture");
    const result = await computePosture(db as never, "org-1");
    const vendor = result.dimensions.find((d) => d.key === "vendor")!;
    expect(vendor.score).toBe(50); // (100 + 0) / 2
    expect(vendor.raw.highOrCritical).toBe(1);
  });
});
