// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { hashPassword } from "@/lib/auth/password";
import { aggregateSystemCard, systemCardFilename } from "./aggregator";

const ORG = "sc-agg-org";
const ORG2 = "sc-agg-org-2";
const BY = { id: "", name: "SC Tester" };
let userId = "";
let fullUcId = "";
let sparseUcId = "";

beforeAll(async () => {
  const pwd = await hashPassword("testtest");
  const u = await prisma.user.upsert({
    where: { email: "sc-agg@test" },
    update: {},
    create: { email: "sc-agg@test", name: "SC Tester", passwordHash: pwd },
  });
  userId = u.id;
  BY.id = userId;

  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "System Card Agg Org" },
  });
  await prisma.organization.upsert({
    where: { id: ORG2 },
    update: {},
    create: { id: ORG2, name: "System Card Agg Org 2" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG, userId } },
    update: {},
    create: { orgId: ORG, userId, role: "admin" },
  });

  const full = await prisma.aiUsecase.create({
    data: {
      orgId: ORG,
      name: "SC Full System",
      ownerId: userId,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "Scores insurance claims.",
      modelCardMd: "Weak on handwritten claims.",
      intendedUseMd: "Automated triage of auto-insurance claims under $10k.",
      prohibitedUseMd: "Not for claims involving injury or fatality.",
    },
  });
  fullUcId = full.id;

  const sparse = await prisma.aiUsecase.create({
    data: {
      orgId: ORG,
      name: "SC Sparse System",
      ownerId: userId,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  sparseUcId = sparse.id;

  await prisma.usecaseRiskAssessment.create({
    data: {
      orgId: ORG,
      usecaseId: fullUcId,
      scoreInt: 12,
      level: "high",
      notes: "Bias exposure on thin-file applicants.",
      assessedById: userId,
    },
  });

  const conn = await prisma.providerConnection.create({
    data: {
      orgId: ORG,
      name: "sc-agg-conn",
      providerType: "openai_compatible",
      credentialsEncrypted: Buffer.alloc(64),
      config: { instanceUrl: "http://localhost:4010" },
      createdBy: userId,
    },
  });
  await prisma.evaluation.create({
    data: {
      orgId: ORG,
      usecaseId: fullUcId,
      connectionId: conn.id,
      model: "gpt-4o-mini",
      status: "completed",
      totalPrompts: 20,
      passedCount: 18,
      failedCount: 2,
      errorCount: 0,
      createdBy: userId,
    },
  });

  const bench = await prisma.driftBenchmark.create({
    data: {
      orgId: ORG,
      usecaseId: fullUcId,
      name: "SC Bench",
      createdById: userId,
    },
  });
  await prisma.driftRun.create({
    data: {
      orgId: ORG,
      benchmarkId: bench.id,
      targetProvider: "openai",
      targetModel: "gpt-4o-mini",
      judgeModel: "gpt-4o",
      status: "completed",
      avgScore: 8.2,
      promptCount: 10,
      completedCount: 10,
      completedAt: new Date(),
    },
  });

  await prisma.usecaseFria.create({
    data: {
      orgId: ORG,
      usecaseId: fullUcId,
      title: "SC FRIA",
      status: "approved",
      approvedAt: new Date(),
      createdById: userId,
    },
  });

  await prisma.txrReport.create({
    data: {
      orgId: ORG,
      usecaseId: fullUcId,
      title: "SC TXR",
      status: "published",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-03-31"),
      periodLabel: "Q1 2026",
      publishedAt: new Date(),
      createdById: userId,
    },
  });

  await prisma.incident.create({
    data: {
      orgId: ORG,
      title: "SC Incident",
      severity: "high",
      status: "open",
      relatedUsecaseId: fullUcId,
      openedById: userId,
    },
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [ORG, ORG2] } } });
  await prisma.user.deleteMany({ where: { email: "sc-agg@test" } });
  await prisma.$disconnect();
});

describe("aggregateSystemCard", () => {
  it("returns a fully populated card for the seeded system", async () => {
    const db = withOrg(prisma, ORG);
    const card = await aggregateSystemCard({
      db,
      orgId: ORG,
      usecaseId: fullUcId,
      generatedBy: BY,
    });
    expect(card).not.toBeNull();
    expect(card!.snapshot.system.name).toBe("SC Full System");
    expect(card!.readiness.checks).toHaveLength(15);
    expect(card!.latestAssessment?.level).toBe("high");
    expect(card!.latestAssessment?.scoreInt).toBe(12);
    expect(card!.evaluations).toHaveLength(1);
    expect(card!.evaluations[0].model).toBe("gpt-4o-mini");
    expect(card!.driftBenchmarks).toHaveLength(1);
    expect(card!.driftBenchmarks[0].latestRun?.avgScore).toBe(8.2);
    expect(card!.friaRecords[0].status).toBe("approved");
    expect(card!.transparencyReports[0].title).toBe("SC TXR");
    expect(card!.openIncidents[0].severity).toBe("high");
    expect(card!.knownLimitations).toBe("Weak on handwritten claims.");
    expect(card!.intendedUse).toBe(
      "Automated triage of auto-insurance claims under $10k.",
    );
    expect(card!.prohibitedUse).toBe(
      "Not for claims involving injury or fatality.",
    );
    expect(card!.generatedBy.name).toBe("SC Tester");
  });

  it("falls back cleanly for a sparse system", async () => {
    const db = withOrg(prisma, ORG);
    const card = await aggregateSystemCard({
      db,
      orgId: ORG,
      usecaseId: sparseUcId,
      generatedBy: BY,
    });
    expect(card).not.toBeNull();
    expect(card!.latestAssessment).toBeNull();
    expect(card!.evaluations).toHaveLength(0);
    expect(card!.driftBenchmarks).toHaveLength(0);
    expect(card!.friaRecords).toHaveLength(0);
    expect(card!.transparencyReports).toHaveLength(0);
    expect(card!.openIncidents).toHaveLength(0);
    expect(card!.knownLimitations).toBe("No known limitations documented.");
    expect(card!.intendedUse).toBe("No intended use statement documented.");
    expect(card!.prohibitedUse).toBe("No prohibited-use statement documented.");
  });

  it("returns null for another org's usecase", async () => {
    const db = withOrg(prisma, ORG2);
    const card = await aggregateSystemCard({
      db,
      orgId: ORG2,
      usecaseId: fullUcId,
      generatedBy: BY,
    });
    expect(card).toBeNull();
  });
});

describe("systemCardFilename", () => {
  it("slugifies the name and appends the date", () => {
    expect(
      systemCardFilename(
        "Loan Approval (v2)!",
        "md",
        new Date("2026-07-06T10:00:00Z"),
      ),
    ).toBe("system-card-loan-approval-v2-2026-07-06.md");
  });

  it("falls back when the name has no usable characters", () => {
    expect(
      systemCardFilename("···", "pdf", new Date("2026-07-06T10:00:00Z")),
    ).toBe("system-card-system-2026-07-06.pdf");
  });
});
