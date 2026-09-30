// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { aggregateModelCard } from "./aggregator";

const ORG = "mc-agg-org";
let userId = "";
let usecaseId = "";
let connectionId = "";

beforeAll(async () => {
  const pwd = await hashPassword("testtest");
  const u = await prisma.user.upsert({
    where: { email: "mc-agg@test" },
    update: {},
    create: { email: "mc-agg@test", name: "MC Tester", passwordHash: pwd },
  });
  userId = u.id;

  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Model Card Agg Org" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG, userId } },
    update: {},
    create: { orgId: ORG, userId, role: "admin" },
  });

  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: ORG,
      name: "Test Loan Approval",
      ownerId: userId,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "Approves loan applications under $50k.",
      modelCardMd: "Model may underperform on thin-file customers.",
    },
  });
  usecaseId = uc.id;

  const conn = await prisma.providerConnection.create({
    data: {
      orgId: ORG,
      name: "mc-agg-conn",
      providerType: "openai_compatible",
      credentialsEncrypted: Buffer.alloc(64),
      config: { instanceUrl: "http://localhost:4010" },
      createdBy: userId,
    },
  });
  connectionId = conn.id;

  await prisma.usecaseRiskAssessment.create({
    data: {
      orgId: ORG,
      usecaseId,
      scoreInt: 14,
      level: "high",
      notes: "Lending bias risk",
      assessedById: userId,
    },
  });

  await prisma.evaluation.create({
    data: {
      orgId: ORG,
      connectionId,
      model: "gpt-4o-mini",
      promptSourceIds: ["builtin:jailbreak.dan-v1"],
      status: "completed",
      totalPrompts: 20,
      passedCount: 18,
      failedCount: 2,
      errorCount: 0,
      createdBy: userId,
    },
  });
});

afterAll(async () => {
  await prisma.evaluation.deleteMany({ where: { orgId: ORG } });
  await prisma.usecaseRiskAssessment.deleteMany({ where: { orgId: ORG } });
  await prisma.providerConnection.deleteMany({ where: { orgId: ORG } });
  await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
  await prisma.membership.deleteMany({ where: { orgId: ORG } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({ where: { id: ORG } });
});

describe("aggregateModelCard", () => {
  it("returns usecase + inventory + risk + evaluations + limitations", async () => {
    const card = await aggregateModelCard({
      orgId: ORG,
      usecaseId,
      generatedBy: { id: userId, name: "Tester" },
    });

    expect(card.usecase.name).toBe("Test Loan Approval");
    expect(card.usecase.lifecycleStage).toBe("production");
    expect(card.inventory.ownerEmail).toBe("mc-agg@test");
    expect(card.risk.topRisks).toHaveLength(1);
    expect(card.risk.topRisks[0].severity).toBe("high");
    expect(card.evaluations).toHaveLength(1);
    expect(card.evaluations[0].passedCount).toBe(18);
    expect(card.knownLimitations).toContain("thin-file");
    expect(card.generatedBy.name).toBe("Tester");
  });

  it("falls back to default knownLimitations when modelCardMd is empty", async () => {
    await prisma.aiUsecase.update({
      where: { id: usecaseId },
      data: { modelCardMd: "" },
    });
    const card = await aggregateModelCard({
      orgId: ORG,
      usecaseId,
      generatedBy: { id: userId, name: "Tester" },
    });
    expect(card.knownLimitations).toMatch(/No known limitations/);
  });
});
