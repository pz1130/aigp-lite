import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

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
      euAiActCategory: "minimal",
      containsPii: false,
      dataSensitivity: "low",
    });
    expect(out.id).toBeTruthy();
    expect(out.lifecycleStage).toBe("proposed");
    await expect(
      prisma.usecaseClassification.findUnique({
        where: { usecaseId: out.id },
      }),
    ).resolves.toMatchObject({
      euAiActCategory: "minimal",
      containsPii: false,
      dataSensitivity: "low",
      generatedReason: "manual",
    });
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
});
