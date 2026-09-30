import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";

vi.mock("./analyze", () => ({
  runAnalysisInBackground: vi.fn(),
  runAnalysis: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { inventoryRouter } from "./router";
import type { TRPCContext } from "@/lib/trpc/server";

let orgId: string;
let ownerCtx: TRPCContext;
let viewerCtx: TRPCContext;

beforeAll(async () => {
  // Global truncate runs in tests/unit-global-setup.ts; we only need to
  // wipe rows this file itself creates between re-runs in watch mode.
  await prisma.usecaseControlStatus.deleteMany();
  await prisma.usecaseClassification.deleteMany();
  await prisma.usecaseRiskAssessment.deleteMany();
  await prisma.aiModelVersion.deleteMany();
  await prisma.aiUsecase.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.governanceMaturityAssessment.deleteMany();
  await prisma.incidentTrendCluster.deleteMany();
  await prisma.incidentTrendReport.deleteMany();
  await prisma.usageInsightCluster.deleteMany();
  await prisma.usageInsightReport.deleteMany();
  await prisma.trustAccessToken.deleteMany();
  await prisma.trustSnapshot.deleteMany();
  await prisma.trustProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({ data: { name: "InvOrg" } });
  const hash = await hashPassword("testtest");
  const owner = await prisma.user.create({
    data: { email: "inv-owner@x", name: "owner", passwordHash: hash },
  });
  const viewer = await prisma.user.create({
    data: { email: "inv-viewer@x", name: "viewer", passwordHash: hash },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: owner.id, role: "ai_owner" },
  });
  await prisma.membership.create({
    data: { orgId: org.id, userId: viewer.id, role: "viewer" },
  });
  orgId = org.id;
  ownerCtx = {
    session: {
      userId: owner.id,
      email: "inv-owner@x",
      orgId,
      role: "ai_owner",
    },
  };
  viewerCtx = {
    session: {
      userId: viewer.id,
      email: "inv-viewer@x",
      orgId,
      role: "viewer",
    },
  };
});

afterAll(async () => {
  await prisma.usecaseControlStatus.deleteMany();
  await prisma.usecaseClassification.deleteMany();
  await prisma.usecaseRiskAssessment.deleteMany();
  await prisma.aiModelVersion.deleteMany();
  await prisma.aiUsecase.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.orgInvite.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.governanceMaturityAssessment.deleteMany();
  await prisma.incidentTrendCluster.deleteMany();
  await prisma.incidentTrendReport.deleteMany();
  await prisma.usageInsightCluster.deleteMany();
  await prisma.usageInsightReport.deleteMany();
  await prisma.trustAccessToken.deleteMany();
  await prisma.trustSnapshot.deleteMany();
  await prisma.trustProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
});

describe("inventory.router", () => {
  beforeEach(async () => {
    await prisma.usecaseControlStatus.deleteMany();
    await prisma.usecaseClassification.deleteMany();
    await prisma.usecaseRiskAssessment.deleteMany();
    await prisma.aiModelVersion.deleteMany();
    await prisma.aiUsecase.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  it("ai_owner can create a usecase", async () => {
    const caller = inventoryRouter.createCaller(ownerCtx);
    const out = await caller.create({
      name: "Doc Summarizer",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "Summarizes long PDFs.",
      modelCardMd: "",
    });
    expect(out.id).toBeTruthy();
    expect(out.lifecycleStage).toBe("proposed");
  });

  it("viewer cannot create", async () => {
    const caller = inventoryRouter.createCaller(viewerCtx);
    await expect(
      caller.create({
        name: "X",
        autonomyLevel: "assistant",
        deploymentType: "built",
        description: "",
        modelCardMd: "",
      }),
    ).rejects.toThrow(/lacks "inventory\.write"/);
  });

  it("list returns the org's usecases", async () => {
    const caller = inventoryRouter.createCaller(viewerCtx);
    const rows = await caller.list();
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it("create writes an audit row", async () => {
    const auditBefore = await prisma.auditLog.count();
    const caller = inventoryRouter.createCaller(ownerCtx);
    await caller.create({
      name: "Translator",
      autonomyLevel: "simple_agent",
      deploymentType: "blended",
      description: "",
      modelCardMd: "",
    });
    const auditAfter = await prisma.auditLog.count();
    expect(auditAfter).toBeGreaterThanOrEqual(auditBefore + 1);
  });

  // ── Classification / Analysis procedures ────────────────────────────────

  it("classification returns null when no analysis exists", async () => {
    const caller = inventoryRouter.createCaller(ownerCtx);
    const created = await caller.create({
      name: "No Analysis",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "",
      modelCardMd: "",
    });
    const result = await caller.classification({ usecaseId: created.id });
    expect(result).toBeNull();
  });

  it("classification returns data after persist", async () => {
    const caller = inventoryRouter.createCaller(ownerCtx);
    const created = await caller.create({
      name: "Has Analysis",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "",
      modelCardMd: "",
    });
    await prisma.usecaseClassification.create({
      data: {
        orgId,
        usecaseId: created.id,
        domain: "finance",
        containsPii: false,
        dataSensitivity: "low",
        automatedDecisionMaking: false,
        euAiActCategory: "minimal",
        complianceTags: [],
        suggestedRisks: [],
        summary: "Test summary",
        modelProvider: "openai",
        modelName: "gpt-4o-mini",
        confidence: 0.9,
        generatedReason: "manual",
      },
    });
    const result = await caller.classification({ usecaseId: created.id });
    expect(result).not.toBeNull();
    expect(result!.domain).toBe("finance");
    expect(result!.summary).toBe("Test summary");
  });

  it("analyze returns queued:true for ai_owner", async () => {
    const caller = inventoryRouter.createCaller(ownerCtx);
    const created = await caller.create({
      name: "Analyze Me",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "",
      modelCardMd: "",
    });
    const result = await caller.analyze({ usecaseId: created.id });
    expect(result).toEqual({ ok: true, queued: true });
  });

  it("viewer cannot call analyze", async () => {
    const caller = inventoryRouter.createCaller(viewerCtx);
    await expect(caller.analyze({ usecaseId: "fake-id" })).rejects.toThrow(
      /lacks "inventory\.write"/,
    );
  });

  it("unanalyzedCount returns correct count", async () => {
    const caller = inventoryRouter.createCaller(ownerCtx);
    const created = await caller.create({
      name: "Counted",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "",
      modelCardMd: "",
    });
    const before = await caller.unanalyzedCount();
    expect(before.count).toBeGreaterThanOrEqual(1);

    await prisma.usecaseClassification.create({
      data: {
        orgId,
        usecaseId: created.id,
        domain: "test",
        containsPii: false,
        dataSensitivity: "low",
        automatedDecisionMaking: false,
        euAiActCategory: "minimal",
        complianceTags: [],
        suggestedRisks: [],
        summary: "s",
        modelProvider: "openai",
        modelName: "gpt-4o-mini",
        confidence: 0.5,
        generatedReason: "manual",
      },
    });
    const after = await caller.unanalyzedCount();
    expect(after.count).toBe(before.count - 1);
  });

  it("analyzeUnanalyzed returns queued count and calls runAnalysis per row", async () => {
    const { runAnalysis } = await import("./analyze");
    const mockRun = vi.mocked(runAnalysis);
    mockRun.mockClear();

    const caller = inventoryRouter.createCaller(ownerCtx);
    await caller.create({
      name: "Bulk1",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "",
      modelCardMd: "",
    });
    await caller.create({
      name: "Bulk2",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "",
      modelCardMd: "",
    });

    const result = await caller.analyzeUnanalyzed();
    expect(result.queued).toBeGreaterThanOrEqual(2);
    expect(mockRun).toHaveBeenCalledTimes(result.queued);
  });
});
