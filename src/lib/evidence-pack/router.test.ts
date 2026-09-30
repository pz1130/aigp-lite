import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Role } from "@/lib/rbac/roles";

const enqueueMock = vi.fn();
vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueJob: (...args: unknown[]) => enqueueMock(...args),
}));

const mockDb = vi.hoisted(() => {
  const db = {
    $extends: vi.fn(),
    evidencePack: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
    },
  };
  db.$extends.mockImplementation(() => db);
  return db;
});

vi.mock("@/lib/db", () => ({ prisma: mockDb }));
vi.mock("@/lib/audit/log", () => ({ writeAudit: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.evidencePack.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "pack-1",
      ...data,
    }),
  );
});

function ctx(role: Role) {
  return {
    session: { userId: "u1", orgId: "org1", role, email: "u1@x" },
    db: mockDb,
    ip: undefined,
    userAgent: undefined,
  };
}

describe("evidencePackRouter", () => {
  it("exposes generate and list procedures", async () => {
    const { evidencePackRouter } = await import("./router");
    const keys = Object.keys(
      evidencePackRouter._def.procedures ?? evidencePackRouter._def.record,
    );
    expect(keys).toContain("generate");
    expect(keys).toContain("list");
  });

  it("generate creates a pending row and enqueues the build job", async () => {
    const { evidencePackRouter } = await import("./router");
    const caller = evidencePackRouter.createCaller(ctx("admin"));
    await caller.generate({ usecaseId: "uc1", framework: "nist-ai-rmf" });

    expect(mockDb.evidencePack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending", orgId: "org1" }),
      }),
    );
    expect(enqueueMock).toHaveBeenCalledWith(
      "evidencePack.build",
      expect.objectContaining({ packId: "pack-1" }),
    );
  });

  it("list returns the use-case's packs org-scoped", async () => {
    mockDb.evidencePack.findMany.mockResolvedValueOnce([
      { id: "p1", status: "ready", packHash: "abc", createdAt: new Date() },
    ]);
    const { evidencePackRouter } = await import("./router");
    const caller = evidencePackRouter.createCaller(ctx("admin"));
    const result = await caller.list({ usecaseId: "uc1" });
    expect(result).toHaveLength(1);
  });

  it("viewer cannot generate (lacks evidence_pack.write)", async () => {
    const { evidencePackRouter } = await import("./router");
    const caller = evidencePackRouter.createCaller(ctx("viewer"));
    await expect(
      caller.generate({ usecaseId: "uc1", framework: "nist-ai-rmf" }),
    ).rejects.toThrow();
  });
});
