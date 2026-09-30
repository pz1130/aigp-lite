import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  getAssessment,
  saveDraft,
  completeAssessment,
  reopenAssessment,
  FairnessError,
} from "./service";

const ORG = "org-fair-test";
const USER = "user-fair-test";

async function makeUsecase(id: string) {
  await prisma.aiUsecase.upsert({
    where: { id },
    update: {},
    create: {
      id,
      orgId: ORG,
      name: `uc-${id}`,
      ownerId: USER,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
}

beforeAll(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Fair Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "fair@test.local", name: "Fair Tester" },
  });
});

describe("fairness service", () => {
  it("saveDraft creates an assessment and replaces attributes", async () => {
    await makeUsecase("uc-fair-1");
    const a = await saveDraft({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-1",
      proxyReview: "yes",
      feedbackLoop: "no",
      attributes: [
        {
          name: "gender",
          metric: "selection_rate",
          subgroups: [
            { label: "f", value: 0.4 },
            { label: "m", value: 0.5 },
          ],
        },
      ],
    });
    expect(a.status).toBe("draft");
    expect(a.attributes).toHaveLength(1);
    expect(a.attributes[0].subgroups).toHaveLength(2);

    const b = await saveDraft({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-1",
      proxyReview: "yes",
      feedbackLoop: "no",
      attributes: [
        {
          name: "age",
          metric: "error_rate",
          subgroups: [
            { label: "young", value: 0.1 },
            { label: "old", value: 0.1 },
          ],
        },
      ],
    });
    expect(b.attributes.map((x) => x.name)).toEqual(["age"]);
  });

  it("completeAssessment requires a computable attribute and both checks", async () => {
    await makeUsecase("uc-fair-2");
    await saveDraft({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-2",
      proxyReview: null,
      feedbackLoop: null,
      attributes: [
        {
          name: "gender",
          metric: "selection_rate",
          subgroups: [
            { label: "f", value: 0.4 },
            { label: "m", value: 0.5 },
          ],
        },
      ],
    });
    await expect(
      completeAssessment({
        orgId: ORG,
        actorId: USER,
        ip: "127.0.0.1",
        usecaseId: "uc-fair-2",
      }),
    ).rejects.toBeInstanceOf(FairnessError);

    await saveDraft({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-2",
      proxyReview: "yes",
      feedbackLoop: "yes",
      attributes: [
        {
          name: "gender",
          metric: "selection_rate",
          subgroups: [
            { label: "f", value: 0.4 },
            { label: "m", value: 0.5 },
          ],
        },
      ],
    });
    const done = await completeAssessment({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-2",
    });
    expect(done.status).toBe("completed");
    expect(done.completedById).toBe(USER);
    expect(done.completedAt).not.toBeNull();
  });

  it("reopenAssessment returns to draft", async () => {
    await makeUsecase("uc-fair-3");
    await saveDraft({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-3",
      proxyReview: "yes",
      feedbackLoop: "yes",
      attributes: [
        {
          name: "gender",
          metric: "selection_rate",
          subgroups: [
            { label: "f", value: 0.4 },
            { label: "m", value: 0.5 },
          ],
        },
      ],
    });
    await completeAssessment({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-3",
    });
    const reopened = await reopenAssessment({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-3",
    });
    expect(reopened.status).toBe("draft");
    expect(reopened.completedAt).toBeNull();
  });

  it("getAssessment is org-scoped (cross-org returns null)", async () => {
    await makeUsecase("uc-fair-4");
    await saveDraft({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-4",
      proxyReview: "yes",
      feedbackLoop: "yes",
      attributes: [],
    });
    expect(await getAssessment("some-other-org", "uc-fair-4")).toBeNull();
    expect(await getAssessment(ORG, "uc-fair-4")).not.toBeNull();
  });

  it("writes an audit row on complete", async () => {
    await makeUsecase("uc-fair-5");
    await saveDraft({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-5",
      proxyReview: "yes",
      feedbackLoop: "yes",
      attributes: [
        {
          name: "gender",
          metric: "selection_rate",
          subgroups: [
            { label: "f", value: 0.4 },
            { label: "m", value: 0.5 },
          ],
        },
      ],
    });
    await completeAssessment({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      usecaseId: "uc-fair-5",
    });
    const row = await prisma.auditLog.findFirst({
      where: {
        orgId: ORG,
        action: "fairness.complete",
        resourceType: "fairness",
      },
      orderBy: { seqNum: "desc" },
    });
    expect(row).not.toBeNull();
  });
});
