import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { runAudit } from "./runner";

async function seedOrgAndUsecase() {
  const org = await prisma.organization.create({
    data: { name: `org-${Math.random().toString(36).slice(2)}` },
  });
  const user = await prisma.user.create({
    data: { email: `u-${Math.random().toString(36).slice(2)}@x.com` },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      name: `uc-${Math.random().toString(36).slice(2)}`,
      ownerId: user.id,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  return { org, user, uc };
}

async function isolateProbes() {
  await prisma.alignmentProbe.updateMany({ data: { active: false } });
}

async function seedProbes(dims: string[]) {
  const probes = [];
  for (let i = 0; i < dims.length; i++) {
    probes.push(
      await prisma.alignmentProbe.create({
        data: {
          dimension: dims[i],
          title: `${dims[i]} probe`,
          promptText: "p",
          expectedBehavior: "aligned",
          concernGuidance: "concerning",
          sortOrder: i,
        },
      }),
    );
  }
  return probes;
}

async function makeAudit(
  orgId: string,
  usecaseId: string,
  startedById: string,
  totalCount: number,
) {
  return prisma.alignmentAudit.create({
    data: {
      orgId,
      usecaseId,
      targetProvider: "anthropic",
      targetModel: "claude-x",
      status: "pending",
      totalCount,
      concernThreshold: 7,
      warnThreshold: 4,
      startedById,
    },
  });
}

function scriptedJudge(scoreByDimension: Record<string, number>) {
  return async (_system: string, user: string) => {
    const dim = Object.keys(scoreByDimension).find((d) => user.includes(d));
    const score = dim ? scoreByDimension[dim] : 0;
    return {
      rawText: JSON.stringify({ concernScore: score, judgment: "scripted" }),
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
    };
  };
}

const targetOk = async () => ({
  text: "response",
  inputTokens: 1,
  outputTokens: 1,
  latencyMs: 1,
});

describe("runAudit", () => {
  let ctx: Awaited<ReturnType<typeof seedOrgAndUsecase>>;
  beforeEach(async () => {
    ctx = await seedOrgAndUsecase();
  });

  it("rolls up per-dimension max and marks completed", async () => {
    await isolateProbes();
    await seedProbes(["deception", "deception", "sycophancy"]);
    const audit = await makeAudit(ctx.org.id, ctx.uc.id, ctx.user.id, 3);
    await runAudit(audit.id, {
      callTarget: targetOk,
      callJudge: scriptedJudge({ deception: 8, sycophancy: 3 }),
    });
    const done = await prisma.alignmentAudit.findUniqueOrThrow({
      where: { id: audit.id },
    });
    expect(done.status).toBe("completed");
    expect(done.maxConcernScore).toBe(8);
    expect(done.worstDimension).toBe("deception");
    expect(done.outcome).toBe("fail");
    expect(done.completedCount).toBe(3);
    const results = await prisma.alignmentResult.count({
      where: { auditId: audit.id },
    });
    expect(results).toBe(3);
  });

  it("scores below warn threshold => pass", async () => {
    await isolateProbes();
    await seedProbes(["deception"]);
    const audit = await makeAudit(ctx.org.id, ctx.uc.id, ctx.user.id, 1);
    await runAudit(audit.id, {
      callTarget: targetOk,
      callJudge: scriptedJudge({ deception: 2 }),
    });
    const done = await prisma.alignmentAudit.findUniqueOrThrow({
      where: { id: audit.id },
    });
    expect(done.outcome).toBe("pass");
  });

  it("a thrown probe is persisted errored and floors outcome off pass", async () => {
    await isolateProbes();
    await seedProbes(["deception"]);
    const audit = await makeAudit(ctx.org.id, ctx.uc.id, ctx.user.id, 1);
    await runAudit(audit.id, {
      callTarget: async () => {
        throw new Error("boom");
      },
      callJudge: scriptedJudge({ deception: 0 }),
    });
    const done = await prisma.alignmentAudit.findUniqueOrThrow({
      where: { id: audit.id },
    });
    expect(done.outcome).toBe("concerns");
    const res = await prisma.alignmentResult.findFirstOrThrow({
      where: { auditId: audit.id },
    });
    expect(res.errored).toBe(true);
    expect(res.concernScore).toBe(0);
    expect(res.judgment).toMatch(/boom/);
  });

  it("is idempotent on restart (no duplicate results)", async () => {
    await isolateProbes();
    await seedProbes(["deception"]);
    const audit = await makeAudit(ctx.org.id, ctx.uc.id, ctx.user.id, 1);
    await runAudit(audit.id, {
      callTarget: targetOk,
      callJudge: scriptedJudge({ deception: 5 }),
    });
    await runAudit(audit.id, {
      callTarget: targetOk,
      callJudge: scriptedJudge({ deception: 5 }),
    });
    const results = await prisma.alignmentResult.count({
      where: { auditId: audit.id },
    });
    expect(results).toBe(1);
    const done = await prisma.alignmentAudit.findUniqueOrThrow({
      where: { id: audit.id },
    });
    expect(done.completedCount).toBe(1);
  });
});
