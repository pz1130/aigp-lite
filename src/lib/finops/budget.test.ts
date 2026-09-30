import { describe, it, expect, vi, beforeEach } from "vitest";
import { findRelevantBudgets, tryFireAlert } from "./budget";
import type { Budget } from "@/lib/prisma";

// Minimal Budget type for testing (Parameters[0] of tryFireAlert, loosely typed)
type TestBudget = Parameters<typeof tryFireAlert>[0];

vi.mock("@/lib/db", () => ({
  prisma: {
    budget: {
      findMany: vi.fn<() => Promise<Budget[]>>(),
    },
    budgetAlert: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findRelevantBudgets", () => {
  it("returns org-level budgets for any request", async () => {
    const orgBudget = {
      id: "b1",
      orgId: "o1",
      scope: "org",
      scopeRefId: null,
      period: "monthly",
      amountUsd: 100,
    } as unknown as TestBudget;
    (prisma.budget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      orgBudget,
    ]);

    const result = await findRelevantBudgets({ orgId: "o1" });
    expect(result).toHaveLength(1);
    expect(prisma.budget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "o1",
          isActive: true,
        }),
      }),
    );
  });

  it("includes api_key scope filter when apiKeyId provided", async () => {
    (prisma.budget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await findRelevantBudgets({ orgId: "o1", apiKeyId: "k1" });
    const call = (prisma.budget.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    const orClauses = call?.where?.OR ?? [];
    expect(orClauses).toContainEqual(
      expect.objectContaining({ scope: "api_key", scopeRefId: "k1" }),
    );
  });

  it("includes usecase scope filter when usecaseId provided", async () => {
    (prisma.budget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await findRelevantBudgets({ orgId: "o1", usecaseId: "u1" });
    const call = (prisma.budget.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    const orClauses = call?.where?.OR ?? [];
    expect(orClauses).toContainEqual(
      expect.objectContaining({ scope: "usecase", scopeRefId: "u1" }),
    );
  });

  it("filters out inactive budgets", async () => {
    (prisma.budget.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await findRelevantBudgets({ orgId: "o1" });
    const call = (prisma.budget.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(call?.where?.isActive).toBe(true);
  });
});

describe("tryFireAlert", () => {
  const fakeEmit = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    fakeEmit.mockClear();
  });

  it("fires alert and emits event on first call", async () => {
    (prisma.budgetAlert.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1",
    });
    const budget = {
      id: "b1",
      orgId: "o1",
      scope: "org",
      scopeRefId: null,
      period: "monthly",
      amountUsd: 100,
    } as unknown as TestBudget;
    const range = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-31"),
    };

    const fired = await tryFireAlert(budget, 80, range, fakeEmit);
    expect(fired).toBe(true);
    expect(prisma.budgetAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ budgetId: "b1", threshold: 80 }),
    });
    expect(fakeEmit).toHaveBeenCalledWith(
      expect.objectContaining({ budgetId: "b1", threshold: 80 }),
    );
  });

  it("no-ops on P2002 unique-constraint violation (already alerted)", async () => {
    const p2002 = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
    });
    (prisma.budgetAlert.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      p2002,
    );

    const budget = {
      id: "b2",
      orgId: "o1",
      scope: "org",
      scopeRefId: null,
      period: "monthly",
      amountUsd: 100,
    } as unknown as TestBudget;
    const range = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-31"),
    };

    const fired = await tryFireAlert(budget, 80, range, fakeEmit);
    expect(fired).toBe(false);
    expect(fakeEmit).not.toHaveBeenCalled();
  });

  it("throws on unexpected DB errors", async () => {
    const other = Object.assign(new Error("Connection lost"), {
      code: "P1001",
    });
    (prisma.budgetAlert.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      other,
    );

    const budget = {
      id: "b3",
      orgId: "o1",
      scope: "org",
      scopeRefId: null,
      period: "monthly",
      amountUsd: 100,
    } as unknown as TestBudget;
    const range = {
      start: new Date("2026-01-01"),
      end: new Date("2026-01-31"),
    };

    await expect(tryFireAlert(budget, 100, range, fakeEmit)).rejects.toThrow(
      "Connection lost",
    );
  });
});
