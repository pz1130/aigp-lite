import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  aivtfAssessment: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findFirstOrThrow: vi.fn(),
  },
  aivtfAnswer: {
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    createMany: vi.fn(),
  },
  aivtfProcess: { findMany: vi.fn() },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

beforeEach(() => vi.clearAllMocks());

describe("submitAssessment", () => {
  it("rejects submit when an answer is unanswered", async () => {
    const { submitAssessment, AivtfStateError } = await import("./service");
    db.aivtfAssessment.findFirst.mockResolvedValue({
      id: "a1",
      orgId: "o1",
      status: "draft",
    });
    db.aivtfAnswer.findMany.mockResolvedValue([
      { status: "yes" },
      { status: "unanswered" },
    ]);
    await expect(
      submitAssessment({ orgId: "o1", id: "a1", userId: "u1" }),
    ).rejects.toBeInstanceOf(AivtfStateError);
  });

  it("submits when all answered", async () => {
    const { submitAssessment } = await import("./service");
    db.aivtfAssessment.findFirst.mockResolvedValue({
      id: "a1",
      orgId: "o1",
      status: "draft",
    });
    db.aivtfAnswer.findMany.mockResolvedValue([
      { status: "yes" },
      { status: "na" },
    ]);
    db.aivtfAssessment.update.mockResolvedValue({
      id: "a1",
      status: "submitted",
    });
    const r = await submitAssessment({ orgId: "o1", id: "a1", userId: "u1" });
    expect(r.status).toBe("submitted");
  });
});

describe("approveAssessment", () => {
  it("blocks self-approval", async () => {
    const { approveAssessment, AivtfStateError } = await import("./service");
    db.aivtfAssessment.findFirst.mockResolvedValue({
      id: "a1",
      orgId: "o1",
      status: "submitted",
      createdById: "u1",
    });
    await expect(
      approveAssessment({ orgId: "o1", id: "a1", userId: "u1" }),
    ).rejects.toBeInstanceOf(AivtfStateError);
  });
});

describe("saveAnswer", () => {
  it("rejects edits unless draft", async () => {
    const { saveAnswer, AivtfStateError } = await import("./service");
    db.aivtfAssessment.findFirst.mockResolvedValue({
      id: "a1",
      orgId: "o1",
      status: "approved",
    });
    await expect(
      saveAnswer({
        orgId: "o1",
        id: "a1",
        userId: "u1",
        processCode: "1.1.1",
        status: "yes",
        evidenceRefs: [],
      }),
    ).rejects.toBeInstanceOf(AivtfStateError);
  });
});
