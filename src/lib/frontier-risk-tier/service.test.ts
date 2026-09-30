import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createAssessment,
  saveAnswer,
  submitAssessment,
  approveAssessment,
  newVersion,
  FrontierRiskTierStateError,
} from "./service";

const CAT = "FRTTEST_SVC";
const TITLE = "FRT-SVC-TEST assessment";

async function cleanup() {
  await prisma.frtAssessment.deleteMany({ where: { title: TITLE } });
  await prisma.frtCategory.deleteMany({
    where: { code: { startsWith: "FRTTEST_SVC" } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: "FRTSVC-" } },
  });
}

async function seedCatalog() {
  const c = await prisma.frtCategory.create({
    data: { code: CAT, order: 9001, title: "SVC Cat", summary: "s" },
  });
  await prisma.frtThreshold.create({
    data: {
      categoryId: c.id,
      code: "FRT-FRTTEST_SVC-T1-1",
      tier: 1,
      order: 1,
      statement: "x",
    },
  });
  await prisma.frtThreshold.create({
    data: {
      categoryId: c.id,
      code: "FRT-FRTTEST_SVC-T2-1",
      tier: 2,
      order: 1,
      statement: "y",
    },
  });
}

async function makeOrgUsers() {
  const org = await prisma.organization.create({
    data: { name: "FRTSVC-" + Date.now() },
  });
  const u1 = await prisma.user.create({
    data: {
      email: `c-${Date.now()}@t.local`,
      name: "Creator",
      passwordHash: "x",
    },
  });
  const u2 = await prisma.user.create({
    data: {
      email: `a-${Date.now()}@t.local`,
      name: "Approver",
      passwordHash: "x",
    },
  });
  return { org, creator: u1, approver: u2 };
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("FRT service lifecycle", () => {
  it("creates with one unanswered answer per catalog threshold", async () => {
    await seedCatalog();
    const { org, creator } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TITLE,
    });
    const answers = await prisma.frtAnswer.findMany({
      where: { assessmentId: a.id },
    });
    const codes = answers.map((x) => x.thresholdCode);
    expect(codes).toContain("FRT-FRTTEST_SVC-T1-1");
    expect(codes).toContain("FRT-FRTTEST_SVC-T2-1");
    expect(answers.every((x) => x.status === "unanswered")).toBe(true);
  });

  it("rejects submit while any threshold is unanswered", async () => {
    await seedCatalog();
    const { org, creator } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TITLE,
    });
    await expect(
      submitAssessment({ orgId: org.id, id: a.id, userId: creator.id }),
    ).rejects.toBeInstanceOf(FrontierRiskTierStateError);
  });

  it("runs create→save→submit→approve→newVersion and blocks self-approval", async () => {
    await seedCatalog();
    const { org, creator, approver } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TITLE,
    });
    const all = await prisma.frtAnswer.findMany({
      where: { assessmentId: a.id },
    });
    for (const ans of all) {
      await saveAnswer({
        orgId: org.id,
        id: a.id,
        userId: creator.id,
        thresholdCode: ans.thresholdCode,
        status: "met",
        evidenceRefs: [],
      });
    }
    const submitted = await submitAssessment({
      orgId: org.id,
      id: a.id,
      userId: creator.id,
    });
    expect(submitted.status).toBe("submitted");

    await expect(
      approveAssessment({ orgId: org.id, id: a.id, userId: creator.id }),
    ).rejects.toBeInstanceOf(FrontierRiskTierStateError);

    const approved = await approveAssessment({
      orgId: org.id,
      id: a.id,
      userId: approver.id,
    });
    expect(approved.status).toBe("approved");

    const { archived, created } = await newVersion({
      orgId: org.id,
      id: a.id,
      userId: creator.id,
    });
    expect(archived.status).toBe("archived");
    expect(archived.supersededById).toBe(created.id);
    expect(created.version).toBe(a.version + 1);
    const carried = await prisma.frtAnswer.findMany({
      where: { assessmentId: created.id },
    });
    expect(carried.length).toBe(all.length);
    expect(carried.every((x) => x.status === "met")).toBe(true);
  });

  it("does not load assessments from another org", async () => {
    await seedCatalog();
    const { org, creator } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TITLE,
    });
    await expect(
      saveAnswer({
        orgId: "other-org",
        id: a.id,
        userId: creator.id,
        thresholdCode: "FRT-FRTTEST_SVC-T1-1",
        status: "met",
        evidenceRefs: [],
      }),
    ).rejects.toBeInstanceOf(FrontierRiskTierStateError);
  });
});
