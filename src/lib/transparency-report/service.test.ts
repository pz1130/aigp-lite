import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createReport,
  saveSection,
  submitReport,
  approveReport,
  publishReport,
  newVersion,
  TransparencyReportStateError,
} from "./service";
import { requiredSectionKeys } from "./sections";

const TAG = "TXR-SVC";

async function cleanup() {
  await prisma.txrReport.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.frtAssessment.deleteMany({
    where: { title: { startsWith: TAG } },
  });
  await prisma.frtCategory.deleteMany({
    where: { code: { startsWith: "TXRSVC_" } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
}

async function seedFrtCatalog() {
  const existing = await prisma.frtCategory.findFirst({
    where: { code: "TXRSVC_CAT" },
  });
  if (existing) return;
  const c = await prisma.frtCategory.create({
    data: { code: "TXRSVC_CAT", order: 9100, title: "T", summary: "s" },
  });
  await prisma.frtThreshold.create({
    data: {
      categoryId: c.id,
      code: "FRT-TXRSVC_CAT-T1-1",
      tier: 1,
      order: 1,
      statement: "x",
    },
  });
}

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { name: TAG + "-" + Date.now() },
  });
  const creator = await prisma.user.create({
    data: { email: `c-${Date.now()}@t.local`, name: "C", passwordHash: "x" },
  });
  const approver = await prisma.user.create({
    data: { email: `a-${Date.now()}@t.local`, name: "A", passwordHash: "x" },
  });
  return { org, creator, approver };
}

async function approvedFrt(orgId: string, userId: string) {
  const a = await prisma.frtAssessment.create({
    data: {
      orgId,
      usecaseId: null,
      version: 1,
      status: "approved",
      title: TAG + " frt",
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date(),
    },
  });
  return a;
}

async function seedOneActiveSystem(orgId: string, ownerId: string) {
  return prisma.aiUsecase.create({
    data: {
      orgId,
      name: TAG + "-active-" + Date.now(),
      ownerId,
      autonomyLevel: "assistant",
      deploymentType: "built",
      lifecycleStage: "production",
    },
  });
}

async function fillRequired(orgId: string, id: string, userId: string) {
  for (const key of requiredSectionKeys()) {
    await saveSection({ orgId, id, userId, key, text: "content for " + key });
  }
}

const PERIOD = {
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-06-30"),
  periodLabel: "2026 H1",
};

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("txr service lifecycle", () => {
  it("blocks submit until required sections are filled", async () => {
    await seedFrtCatalog();
    const { org, creator } = await makeOrg();
    await approvedFrt(org.id, creator.id);
    const r = await createReport({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TAG + " r",
      ...PERIOD,
    });
    await expect(
      submitReport({ orgId: org.id, id: r.id, userId: creator.id }),
    ).rejects.toBeInstanceOf(TransparencyReportStateError);
  });

  it("blocks org-level submit when no active systems exist", async () => {
    const { org, creator } = await makeOrg();
    const r = await createReport({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TAG + " r",
      ...PERIOD,
    });
    await fillRequired(org.id, r.id, creator.id);
    await expect(
      submitReport({ orgId: org.id, id: r.id, userId: creator.id }),
    ).rejects.toThrow(/active system/i);
  });

  it("allows org-level submit with an active system and no FRT assessment", async () => {
    const { org, creator } = await makeOrg();
    await seedOneActiveSystem(org.id, creator.id);
    const r = await createReport({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TAG + " r",
      ...PERIOD,
    });
    await fillRequired(org.id, r.id, creator.id);
    const submitted = await submitReport({
      orgId: org.id,
      id: r.id,
      userId: creator.id,
    });
    expect(submitted.status).toBe("submitted");
  });

  it("runs create→fill→submit→approve→publish and freezes a snapshot", async () => {
    const { org, creator, approver } = await makeOrg();
    await seedOneActiveSystem(org.id, creator.id);
    const r = await createReport({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TAG + " r",
      ...PERIOD,
    });
    await fillRequired(org.id, r.id, creator.id);
    await submitReport({ orgId: org.id, id: r.id, userId: creator.id });
    await expect(
      approveReport({ orgId: org.id, id: r.id, userId: creator.id }),
    ).rejects.toBeInstanceOf(TransparencyReportStateError); // self-approve blocked
    await approveReport({ orgId: org.id, id: r.id, userId: approver.id });
    const published = await publishReport({
      orgId: org.id,
      id: r.id,
      userId: approver.id,
    });
    expect(published.status).toBe("published");
    expect(published.snapshot).toBeTruthy();
    expect("portfolio" in (published.snapshot as object)).toBe(true);
  });

  it("freezes a portfolio snapshot when publishing an org-level report", async () => {
    const { org, creator, approver } = await makeOrg();
    await seedOneActiveSystem(org.id, creator.id);
    const r = await createReport({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TAG + " org-pub",
      ...PERIOD,
    });
    await fillRequired(org.id, r.id, creator.id);
    await submitReport({ orgId: org.id, id: r.id, userId: creator.id });
    await approveReport({ orgId: org.id, id: r.id, userId: approver.id });
    const published = await publishReport({
      orgId: org.id,
      id: r.id,
      userId: approver.id,
    });
    expect(published.status).toBe("published");
    expect(published.snapshot).toBeTruthy();
    expect("portfolio" in (published.snapshot as object)).toBe(true);
  });

  it("newVersion supersedes the published edition and carries sections forward", async () => {
    const { org, creator, approver } = await makeOrg();
    await seedOneActiveSystem(org.id, creator.id);
    const r = await createReport({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TAG + " r",
      ...PERIOD,
    });
    await fillRequired(org.id, r.id, creator.id);
    await submitReport({ orgId: org.id, id: r.id, userId: creator.id });
    await approveReport({ orgId: org.id, id: r.id, userId: approver.id });
    await publishReport({ orgId: org.id, id: r.id, userId: approver.id });

    const { superseded, created } = await newVersion({
      orgId: org.id,
      id: r.id,
      userId: creator.id,
    });
    expect(superseded.status).toBe("superseded");
    expect(superseded.supersededById).toBe(created.id);
    expect(created.version).toBe(2);
    expect(created.status).toBe("draft");
    expect((created.sections as Record<string, string>).safeguards).toBe(
      "content for safeguards",
    );
  });

  it("scopes reads to the owning org", async () => {
    const { org, creator } = await makeOrg();
    const r = await createReport({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TAG + " r",
      ...PERIOD,
    });
    await expect(
      saveSection({
        orgId: "other-org",
        id: r.id,
        userId: creator.id,
        key: "safeguards",
        text: "x",
      }),
    ).rejects.toBeInstanceOf(TransparencyReportStateError);
  });
});
