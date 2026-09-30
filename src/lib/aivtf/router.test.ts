import { describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Role } from "@/lib/rbac/roles";

const findFirst = vi.fn();

const mockPrisma = {
  $extends: vi.fn(),
  aivtfAssessment: { findFirst },
};
mockPrisma.$extends.mockImplementation(() => mockPrisma);

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/audit/log", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/aivtf/catalog", () => ({ getCatalog: vi.fn(async () => []) }));
vi.mock("@/lib/aivtf/service", () => ({
  createAssessment: vi.fn(),
  saveAnswer: vi.fn(),
  submitAssessment: vi.fn(),
  unsubmitAssessment: vi.fn(),
  approveAssessment: vi.fn(),
  archiveAssessment: vi.fn(),
  newVersion: vi.fn(),
  AivtfStateError: class AivtfStateError extends Error {},
}));

function ctx(role: Role) {
  return {
    session: { userId: "u1", orgId: "org1", role, email: "u1@x" },
    ip: undefined,
    userAgent: undefined,
  };
}

describe("aivtfRouter", () => {
  it("exposes the expected procedures", async () => {
    const { aivtfRouter } = await import("./router");
    const keys = Object.keys(
      aivtfRouter._def.procedures ?? aivtfRouter._def.record,
    );
    for (const k of [
      "catalog",
      "list",
      "get",
      "create",
      "saveAnswer",
      "submit",
      "unsubmit",
      "approve",
      "archive",
      "newVersion",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("aivtf.get for an id in another org returns NOT_FOUND", async () => {
    findFirst.mockResolvedValueOnce(null);
    const { appRouter } = await import("@/lib/trpc/router");
    const caller = appRouter.createCaller(ctx("admin"));
    await expect(
      caller.aivtf.get({ id: "other-org-id" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    } as Partial<TRPCError>);
  });

  it("viewer cannot create (lacks aivtf.write)", async () => {
    const { appRouter } = await import("@/lib/trpc/router");
    const caller = appRouter.createCaller(ctx("viewer"));
    await expect(caller.aivtf.create({ title: "T" })).rejects.toThrow(
      /lacks|FORBIDDEN|forbidden/i,
    );
  });

  it("ai_owner cannot approve (lacks aivtf.approve)", async () => {
    const { appRouter } = await import("@/lib/trpc/router");
    const caller = appRouter.createCaller(ctx("ai_owner"));
    await expect(caller.aivtf.approve({ id: "any-id" })).rejects.toThrow(
      /lacks|FORBIDDEN|forbidden/i,
    );
  });
});
