import { describe, it, expect, vi } from "vitest";
import type { Role } from "@/lib/rbac/roles";

const mockPosture = vi.fn().mockResolvedValue({
  score: 72,
  dimensions: [
    {
      key: "controls",
      label: "Control Coverage",
      score: 80,
      weight: 0.4,
      raw: {},
    },
    {
      key: "incidents",
      label: "Open Incidents",
      score: 60,
      weight: 0.25,
      raw: {},
    },
    { key: "drift", label: "Drift Health", score: 50, weight: 0.2, raw: {} },
    {
      key: "budget",
      label: "Budget Posture",
      score: 100,
      weight: 0.15,
      raw: {},
    },
  ],
  usecases: [],
});

vi.mock("@/lib/governance/posture", () => ({
  computePosture: (...args: unknown[]) => mockPosture(...args),
  POSTURE_WEIGHTS: { controls: 0.4, incidents: 0.25, drift: 0.2, budget: 0.15 },
}));

const mockScore = vi.fn().mockResolvedValue({ overall: 75, dimensions: [] });
vi.mock("@/lib/governance/scoring", () => ({
  computeGovernanceScore: (...args: unknown[]) => mockScore(...args),
}));

const mockPrisma = {
  $extends: vi.fn(),
  governanceScoreSnapshot: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  },
  llmInvocation: { findMany: vi.fn().mockResolvedValue([]) },
};
mockPrisma.$extends.mockImplementation(() => mockPrisma);

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

function ctx(role: Role) {
  return {
    session: { userId: "u1", orgId: "org1", role, email: "u1@x" },
    ip: undefined,
    userAgent: undefined,
  };
}

describe("governanceRouter", () => {
  it("exposes posture procedure", async () => {
    const { governanceRouter } = await import("./router");
    const keys = Object.keys(
      governanceRouter._def.procedures ?? governanceRouter._def.record,
    );
    expect(keys).toContain("posture");
  });

  it("posture returns the aggregator payload shape", async () => {
    const { appRouter } = await import("@/lib/trpc/router");
    const caller = appRouter.createCaller(ctx("admin"));
    const result = await caller.governance.posture();
    expect(result.score).toBe(72);
    expect(result.dimensions).toHaveLength(4);
  });

  it("viewer can read posture (has maturity.read)", async () => {
    const { appRouter } = await import("@/lib/trpc/router");
    const caller = appRouter.createCaller(ctx("viewer"));
    const result = await caller.governance.posture();
    expect(typeof result.score).toBe("number");
  });
});
