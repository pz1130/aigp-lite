import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createAssessment,
  saveAnswer,
  submitAssessment,
  approveAssessment,
  newVersion,
  AgenticGovChecklistStateError,
} from "./service";

const KEY_A = "ag-test-svc-a";
const KEY_B = "ag-test-svc-b";
const TITLE = "AG-SVC-TEST assessment";

async function cleanup() {
  await prisma.agChkAssessment.deleteMany({ where: { title: TITLE } });
  await prisma.agChkSection.deleteMany({
    where: { key: { startsWith: "ag-test-svc-" } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: "AGSVC-" } },
  });
}

async function seedCatalog() {
  const a = await prisma.agChkSection.create({
    data: {
      num: 9201,
      key: KEY_A,
      title: "Sec A",
      intent: "x",
      order: 1,
      seeAlso: [],
    },
  });
  await prisma.agChkItem.create({
    data: {
      sectionId: a.id,
      code: "AG1-91",
      text: "do x",
      guidance: null,
      order: 1,
    },
  });
  const b = await prisma.agChkSection.create({
    data: {
      num: 9202,
      key: KEY_B,
      title: "Sec B",
      intent: "y",
      order: 2,
      seeAlso: [],
    },
  });
  await prisma.agChkItem.create({
    data: {
      sectionId: b.id,
      code: "AG2-91",
      text: "do y",
      guidance: null,
      order: 1,
    },
  });
}

async function makeOrgUsers() {
  const org = await prisma.organization.create({
    data: { name: "AGSVC-" + Date.now() },
  });
  const u1 = await prisma.user.create({
    data: {
      email: `agc-${Date.now()}@t.local`,
      name: "Creator",
      passwordHash: "x",
    },
  });
  const u2 = await prisma.user.create({
    data: {
      email: `aga-${Date.now()}@t.local`,
      name: "Approver",
      passwordHash: "x",
    },
  });
  return { org, u1, u2 };
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("agentic governance service", () => {
  it("creates a draft with one answer per catalog item, version 1", async () => {
    await seedCatalog();
    const { org, u1 } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: u1.id,
      title: TITLE,
    });
    expect(a.version).toBe(1);
    expect(a.status).toBe("draft");
    const answers = await prisma.agChkAnswer.findMany({
      where: { assessmentId: a.id },
    });
    expect(answers.length).toBe(2);
    expect(answers.every((x) => x.status === "unanswered")).toBe(true);
  });

  it("blocks submit until every item is answered, then submits", async () => {
    await seedCatalog();
    const { org, u1 } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: u1.id,
      title: TITLE,
    });
    await expect(
      submitAssessment({ orgId: org.id, id: a.id, userId: u1.id }),
    ).rejects.toBeInstanceOf(AgenticGovChecklistStateError);
    for (const code of ["AG1-91", "AG2-91"]) {
      await saveAnswer({
        orgId: org.id,
        id: a.id,
        userId: u1.id,
        itemCode: code,
        status: "yes",
        evidenceRefs: [],
      });
    }
    const submitted = await submitAssessment({
      orgId: org.id,
      id: a.id,
      userId: u1.id,
    });
    expect(submitted.status).toBe("submitted");
  });

  it("rejects self-approval and allows a different approver", async () => {
    await seedCatalog();
    const { org, u1, u2 } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: u1.id,
      title: TITLE,
    });
    for (const code of ["AG1-91", "AG2-91"]) {
      await saveAnswer({
        orgId: org.id,
        id: a.id,
        userId: u1.id,
        itemCode: code,
        status: "yes",
        evidenceRefs: [],
      });
    }
    await submitAssessment({ orgId: org.id, id: a.id, userId: u1.id });
    await expect(
      approveAssessment({ orgId: org.id, id: a.id, userId: u1.id }),
    ).rejects.toBeInstanceOf(AgenticGovChecklistStateError);
    const approved = await approveAssessment({
      orgId: org.id,
      id: a.id,
      userId: u2.id,
    });
    expect(approved.status).toBe("approved");
  });

  it("creates a new version that copies prior answers and archives the old one", async () => {
    await seedCatalog();
    const { org, u1, u2 } = await makeOrgUsers();
    const a = await createAssessment({
      orgId: org.id,
      userId: u1.id,
      title: TITLE,
    });
    for (const code of ["AG1-91", "AG2-91"]) {
      await saveAnswer({
        orgId: org.id,
        id: a.id,
        userId: u1.id,
        itemCode: code,
        status: "yes",
        evidenceRefs: [],
      });
    }
    await submitAssessment({ orgId: org.id, id: a.id, userId: u1.id });
    await approveAssessment({ orgId: org.id, id: a.id, userId: u2.id });
    const { archived, created } = await newVersion({
      orgId: org.id,
      id: a.id,
      userId: u1.id,
    });
    expect(archived.status).toBe("archived");
    expect(archived.supersededById).toBe(created.id);
    expect(created.version).toBe(2);
    const copied = await prisma.agChkAnswer.findMany({
      where: { assessmentId: created.id },
    });
    expect(copied.length).toBe(2);
    expect(copied.every((x) => x.status === "yes")).toBe(true);
  });
});
