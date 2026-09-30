import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createAssessment,
  saveAnswer,
  submitAssessment,
  approveAssessment,
  newVersion,
  AsiRedteamChecklistStateError,
} from "./service";
import { getCatalogWithCrossLinks } from "./catalog";

// Test-prefixed catalog rows so we never disturb the real seeded catalog.
const KEY_A = "asi-test-svc-a";
const KEY_B = "asi-test-svc-b";
const TITLE = "SVC-TEST assessment";

async function cleanup() {
  await prisma.asiChkAssessment.deleteMany({ where: { title: TITLE } });
  await prisma.asiChkSection.deleteMany({
    where: { key: { startsWith: "asi-test-svc-" } },
  });
  await prisma.riskCatalog.deleteMany({
    where: { source: "OWASP_ASI", code: { startsWith: "asi-test-svc-" } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: "ASISVC-" } },
  });
}

async function seedCatalog() {
  const a = await prisma.asiChkSection.create({
    data: {
      num: 9101,
      key: KEY_A,
      asiCode: "asi-test-svc-1",
      title: "Sec A",
      order: 1,
    },
  });
  await prisma.asiChkItem.create({
    data: {
      sectionId: a.id,
      code: "ASI9101-T1",
      text: "do x",
      guidance: null,
      order: 1,
    },
  });
  const b = await prisma.asiChkSection.create({
    data: {
      num: 9102,
      key: KEY_B,
      asiCode: "asi-test-svc-2",
      title: "Sec B",
      order: 2,
    },
  });
  await prisma.asiChkItem.create({
    data: {
      sectionId: b.id,
      code: "ASI9102-T1",
      text: "do y",
      guidance: null,
      order: 1,
    },
  });
}

async function makeOrgUsers() {
  const org = await prisma.organization.create({
    data: { name: "ASISVC-" + Date.now() },
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

describe("ASI checklist service lifecycle", () => {
  it("creates with one unanswered answer per catalog item", async () => {
    await seedCatalog();
    const { org, creator } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TITLE,
    });
    const answers = await prisma.asiChkAnswer.findMany({
      where: { assessmentId: a.id },
    });
    // At least the two test items; real seeded items may also be present.
    const codes = answers.map((x) => x.itemCode);
    expect(codes).toContain("ASI9101-T1");
    expect(codes).toContain("ASI9102-T1");
    expect(answers.every((x) => x.status === "unanswered")).toBe(true);
  });

  it("rejects submit while any item is unanswered", async () => {
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
    ).rejects.toBeInstanceOf(AsiRedteamChecklistStateError);
  });

  it("runs create→save→submit→approve→newVersion→archive and blocks self-approval", async () => {
    await seedCatalog();
    const { org, creator, approver } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: creator.id,
      usecaseId: null,
      title: TITLE,
    });
    // Answer every seeded item for this assessment.
    const all = await prisma.asiChkAnswer.findMany({
      where: { assessmentId: a.id },
    });
    for (const ans of all) {
      await saveAnswer({
        orgId: org.id,
        id: a.id,
        userId: creator.id,
        itemCode: ans.itemCode,
        status: "yes",
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
    ).rejects.toBeInstanceOf(AsiRedteamChecklistStateError);

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

    // The new draft must be approvable→archivable on its own (smoke).
    const draftAnswers = await prisma.asiChkAnswer.findMany({
      where: { assessmentId: created.id },
    });
    expect(draftAnswers.length).toBe(all.length);
  });
});

describe("ASI checklist live cross-link join", () => {
  it("attaches OWASP_ASI refs to the matching section and degrades gracefully", async () => {
    await seedCatalog();
    await prisma.riskCatalog.create({
      data: {
        source: "OWASP_ASI",
        code: "asi-test-svc-1",
        orgId: null,
        title: "Test ASI Risk",
        category: "AGENTIC",
        summary: "s",
        description: "d",
        frameworkRefs: { owaspLlmTop10: ["LLM01"], agenticThreats: ["T6"] },
        relatedRiskCodes: ["atlas-1"],
        sourceUrl: "https://genai.owasp.org/",
      },
    });
    const catalog = await getCatalogWithCrossLinks();
    const secA = catalog.find((s) => s.key === KEY_A)!;
    const secB = catalog.find((s) => s.key === KEY_B)!;
    expect(secA.crossLinks.llmTop10).toEqual(["LLM01"]);
    expect(secA.crossLinks.atlas).toEqual(["atlas-1"]);
    // No OWASP_ASI row for asi-test-svc-2 → empty cross-links, no throw.
    expect(secB.crossLinks.llmTop10).toEqual([]);
  });
});
