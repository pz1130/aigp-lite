import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";

const ORG = "org-fair-router";
const USER = "user-fair-router";

function caller(role: string) {
  return appRouter.createCaller({
    session: { orgId: ORG, userId: USER, role },
    ip: "127.0.0.1",
    db: prisma,
  } as never);
}

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
    create: { id: ORG, name: "Fair Router Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "fr@test.local", name: "FR" },
  });
});

describe("fairness router", () => {
  it("risk_officer can save and read", async () => {
    await makeUsecase("uc-fr-1");
    const c = caller("risk_officer");
    const saved = await c.fairness.save({
      usecaseId: "uc-fr-1",
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
    expect(saved!.status).toBe("draft");
    const got = await c.fairness.get({ usecaseId: "uc-fr-1" });
    expect(got!.attributes).toHaveLength(1);
  });

  it("viewer cannot save (ForbiddenError)", async () => {
    await makeUsecase("uc-fr-2");
    const c = caller("viewer");
    await expect(
      c.fairness.save({
        usecaseId: "uc-fr-2",
        proxyReview: "yes",
        feedbackLoop: "no",
        attributes: [],
      }),
    ).rejects.toThrow();
  });

  it("maps FairnessError to BAD_REQUEST on premature complete", async () => {
    await makeUsecase("uc-fr-3");
    const c = caller("risk_officer");
    await c.fairness.save({
      usecaseId: "uc-fr-3",
      proxyReview: null,
      feedbackLoop: null,
      attributes: [],
    });
    await expect(
      c.fairness.complete({ usecaseId: "uc-fr-3" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
