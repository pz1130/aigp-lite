import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { workflowEvents } from "@/lib/events/workflow-bus";
import "./../notification/subscribers";
import { recheckStaleApproval } from "./stale-approval";
import { evaluateReadiness } from "./readiness";
import { buildDossierSnapshot } from "./aggregate";

const TAG = "STALE-APPROVAL";

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

function ctx(orgId: string, userId: string): TRPCContext {
  return {
    session: { userId, orgId, role: "admin", email: `${userId}@x` },
  };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 200));
}

/** Minimal-risk usecase with all blocking readiness checks satisfied. */
async function seedMinimalReady(orgId: string, ownerId: string, name: string) {
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId,
      name,
      ownerId,
      autonomyLevel: "assistant",
      deploymentType: "built",
      modelCardMd: "# card",
    },
  });
  await prisma.usecaseClassification.create({
    data: {
      orgId,
      usecaseId: uc.id,
      euAiActCategory: "minimal",
      generatedReason: "t",
    },
  });
  await prisma.usecaseRiskAssessment.create({
    data: {
      orgId,
      usecaseId: uc.id,
      assessedById: ownerId,
      scoreInt: 2,
      level: "low",
    },
  });
  return uc;
}

describe("go-live approval fingerprint (Gap 2)", () => {
  it("recordDecision stores boundTier and boundModelRef on approval", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-bind-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `sa-${Date.now()}@t.local`,
        name: "SA",
        passwordHash: "x",
      },
    });
    const uc = await seedMinimalReady(org.id, user.id, `${TAG}-uc`);
    await prisma.aiModelVersion.create({
      data: { usecaseId: uc.id, version: "v-bound" },
    });
    const caller = appRouter.createCaller(ctx(org.id, user.id));
    await caller.dossier.recordDecision({
      usecaseId: uc.id,
      status: "approved",
      rationale: "ok",
    });
    const review = await prisma.goLiveReview.findFirst({
      where: { orgId: org.id, usecaseId: uc.id, supersededById: null },
    });
    expect(review?.boundModelRef).toBe("v-bound");
    expect(review?.staleApproval).toBe(false);
  });

  it("model version change marks approval stale and notifies", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-mv-${Date.now()}` },
    });
    const owner = await prisma.user.create({
      data: {
        email: `own-${Date.now()}@t.local`,
        name: "Owner",
        passwordHash: "x",
      },
    });
    const decider = await prisma.user.create({
      data: {
        email: `dec-${Date.now()}@t.local`,
        name: "Dec",
        passwordHash: "x",
      },
    });
    await prisma.membership.createMany({
      data: [
        { orgId: org.id, userId: owner.id, role: "ai_owner" },
        { orgId: org.id, userId: decider.id, role: "admin" },
      ],
    });
    const uc = await seedMinimalReady(org.id, owner.id, `${TAG}-mv-uc`);
    await prisma.aiModelVersion.create({
      data: { usecaseId: uc.id, version: "v1" },
    });
    const caller = appRouter.createCaller(ctx(org.id, decider.id));
    await caller.dossier.recordDecision({
      usecaseId: uc.id,
      status: "live",
      rationale: "go",
    });

    const spy = vi.spyOn(workflowEvents, "emitGoLiveStale");
    await caller.inventory.modelVersionCreate({
      usecaseId: uc.id,
      version: "v2",
    });
    await flush();

    const review = await prisma.goLiveReview.findFirst({
      where: { orgId: org.id, usecaseId: uc.id, supersededById: null },
    });
    expect(review?.staleApproval).toBe(true);
    expect(spy).toHaveBeenCalled();

    const snap = await buildDossierSnapshot(
      withOrg(prisma, org.id),
      org.id,
      uc.id,
    );
    expect(evaluateReadiness(snap!).state).toBe("needs_re_review");
    spy.mockRestore();
  });

  it("recheckStaleApproval is idempotent once already stale", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-idem-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `id-${Date.now()}@t.local`,
        name: "ID",
        passwordHash: "x",
      },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-idem-uc`,
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    await prisma.goLiveReview.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        status: "approved",
        boundTier: 1,
        boundModelRef: "v-old",
        staleApproval: true,
        createdById: user.id,
        decidedById: user.id,
        decidedAt: new Date(),
      },
    });
    const spy = vi.spyOn(workflowEvents, "emitGoLiveStale");
    const marked = await recheckStaleApproval(
      withOrg(prisma, org.id),
      org.id,
      uc.id,
    );
    expect(marked).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
