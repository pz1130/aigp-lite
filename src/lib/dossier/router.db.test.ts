import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { workflowEvents } from "@/lib/events/workflow-bus";

const TAG = "DOSSIER-RT";

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

async function seedUsecase(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${tag}-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `rt-${tag}-${Date.now()}@t.local`,
      name: "RT",
      passwordHash: "x",
    },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      name: `${TAG}-${tag}-uc`,
      ownerId: user.id,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  return {
    org,
    user,
    uc,
    caller: appRouter.createCaller(ctx(org.id, user.id)),
  };
}

describe("dossier router", () => {
  it("get returns snapshot + readiness", async () => {
    const { uc, caller } = await seedUsecase("get");
    const res = await caller.dossier.get({ usecaseId: uc.id });
    expect(res.snapshot.system.id).toBe(uc.id);
    expect(res.readiness.checks).toHaveLength(15);
    // unclassified -> classified check fails -> not_ready
    expect(res.readiness.state).toBe("not_ready");
  });

  it("recordDecision refuses approval while a blocking check fails", async () => {
    const { uc, caller } = await seedUsecase("gate");
    await expect(
      caller.dossier.recordDecision({
        usecaseId: uc.id,
        status: "approved",
        rationale: "x",
      }),
    ).rejects.toThrow();
  });

  it("recordDecision records a rejection (no gate) and history reflects it", async () => {
    const { uc, caller } = await seedUsecase("reject");
    const dec = await caller.dossier.recordDecision({
      usecaseId: uc.id,
      status: "rejected",
      rationale: "not yet",
    });
    expect(dec.status).toBe("rejected");
    const hist = await caller.dossier.history({ usecaseId: uc.id });
    expect(hist[0].id).toBe(dec.id);
  });

  it("setOversightAttestation toggles the flag and the check passes", async () => {
    const { uc, caller } = await seedUsecase("oversight");
    const r = await caller.dossier.setOversightAttestation({
      usecaseId: uc.id,
      value: true,
    });
    expect(r.humanOversightAttested).toBe(true);
    const got = await caller.dossier.get({ usecaseId: uc.id });
    expect(got.snapshot.system.humanOversightAttested).toBe(true);
    expect(
      got.readiness.checks.find((c) => c.id === "human_oversight")!.status,
    ).toBe("pass");
  });

  it("rollup lists blocked systems for the org", async () => {
    const { org, uc, caller } = await seedUsecase("rollup");
    // uc is unclassified + in-scope by default? Default lifecycleStage is `proposed`,
    // which is OUT of scope, so put it in scope first.
    await prisma.aiUsecase.update({
      where: { id: uc.id },
      data: { lifecycleStage: "development" },
    });

    const rollup = await caller.dossier.rollup();
    // Unclassified -> classified blocking check fails -> not_ready -> appears in blocked.
    expect(rollup.blocked.some((b) => b.usecaseId === uc.id)).toBe(true);
    expect(rollup.counts.not_ready).toBeGreaterThanOrEqual(1);
    // Scope this assertion to this org's single in-scope system.
    expect(
      rollup.counts.not_ready +
        rollup.counts.conditionally_ready +
        rollup.counts.ready +
        rollup.counts.needs_re_review +
        rollup.counts.live,
    ).toBe(1);
    void org;
  });

  it("recordDecision emits a go-live.decided event", async () => {
    const { org, user, uc, caller } = await seedUsecase("emit");
    const spy = vi.spyOn(workflowEvents, "emitGoLiveDecided");
    try {
      const created = await caller.dossier.recordDecision({
        usecaseId: uc.id,
        status: "withdrawn", // skips the blocking-checks precondition
      });
      expect(spy).toHaveBeenCalledWith({
        orgId: org.id,
        usecaseId: uc.id,
        reviewId: created.id,
        status: "withdrawn",
        decidedByUserId: user.id,
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("dossier system card export", () => {
  let prevActEnv: unknown;
  beforeAll(() => {
    prevActEnv = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown })
      .IS_REACT_ACT_ENVIRONMENT;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT = false;
  });
  afterAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
  });

  it("systemCardMarkdown returns the document and a dated filename", async () => {
    const { uc, caller } = await seedUsecase("card-md");
    const res = await caller.dossier.systemCardMarkdown({ usecaseId: uc.id });
    expect(res.markdown).toContain(`# System Card: ${uc.name}`);
    expect(res.markdown).toContain("## 10. Generation Metadata");
    expect(res.filename).toMatch(/^system-card-.+-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it("systemCardPdf returns a base64 PDF and a dated filename", async () => {
    const { uc, caller } = await seedUsecase("card-pdf");
    const res = await caller.dossier.systemCardPdf({ usecaseId: uc.id });
    const buf = Buffer.from(res.base64, "base64");
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(res.filename).toMatch(/^system-card-.+-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("system card export rejects another org's usecase with NOT_FOUND", async () => {
    const a = await seedUsecase("card-org-a");
    const b = await seedUsecase("card-org-b");
    await expect(
      b.caller.dossier.systemCardMarkdown({ usecaseId: a.uc.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      b.caller.dossier.systemCardPdf({ usecaseId: a.uc.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
