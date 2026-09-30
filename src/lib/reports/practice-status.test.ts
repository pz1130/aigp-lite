import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resolvePracticeStatuses } from "./practice-status";

const ORG = "org-xwalk-test";
const USER = "user-xwalk-test";

let practiceId = "";
let nistId = "";
let isoId = "";

async function ctl(fwCode: string, fwName: string, code: string) {
  const fw = await prisma.riskFramework.upsert({
    where: { code: fwCode },
    update: {},
    create: { code: fwCode, name: fwName, version: "test" },
  });
  return prisma.riskControl.upsert({
    where: { frameworkId_code: { frameworkId: fw.id, code } },
    update: {},
    create: {
      frameworkId: fw.id,
      code,
      title: code,
      description: code,
      severity: "medium",
      frameworkRefs: {},
      sourceUrl: "x",
    },
  });
}

async function statusRow(
  controlId: string,
  status:
    "satisfied" | "in_progress" | "not_started" | "not_applicable" | "failed",
) {
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: ORG,
      name: `uc-${Math.random()}`,
      ownerId: USER,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  await prisma.usecaseControlStatus.create({
    data: { orgId: ORG, usecaseId: uc.id, controlId, status },
  });
  return uc.id;
}

describe("resolvePracticeStatuses", () => {
  beforeAll(async () => {
    await prisma.organization.upsert({
      where: { id: ORG },
      update: {},
      create: { id: ORG, name: "XW Org" },
    });
    await prisma.user.upsert({
      where: { id: USER },
      update: {},
      create: { id: USER, email: "xw@test.local", name: "XW" },
    });
    const p = await ctl("MINDFORGE", "MindForge", "C1-P1");
    const n = await ctl("NIST_AI_RMF", "NIST", "GOVERN-2.1");
    const i = await ctl("ISO_42001", "ISO", "A.3.2");
    practiceId = p.id;
    nistId = n.id;
    isoId = i.id;
    await prisma.controlCrosswalk.upsert({
      where: {
        sourceControlId_targetControlId: {
          sourceControlId: p.id,
          targetControlId: n.id,
        },
      },
      update: { relation: "equivalent" },
      create: {
        sourceControlId: p.id,
        targetControlId: n.id,
        relation: "equivalent",
      },
    });
    await prisma.controlCrosswalk.upsert({
      where: {
        sourceControlId_targetControlId: {
          sourceControlId: p.id,
          targetControlId: i.id,
        },
      },
      update: { relation: "related" },
      create: {
        sourceControlId: p.id,
        targetControlId: i.id,
        relation: "related",
      },
    });
  });
  beforeEach(async () => {
    await prisma.usecaseControlStatus.deleteMany({ where: { orgId: ORG } });
    await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
  });
  afterAll(async () => {
    await prisma.usecaseControlStatus.deleteMany({ where: { orgId: ORG } });
    await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
    await prisma.controlCrosswalk.deleteMany({
      where: { sourceControlId: practiceId },
    });
    await prisma.user.delete({ where: { id: USER } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: ORG } });
  });

  it("inherits satisfied from an equivalent NIST control when no direct status", async () => {
    await statusRow(nistId, "satisfied");
    const res = await resolvePracticeStatuses(ORG, practiceId);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("satisfied");
    expect(res[0].source).toBe("inherited");
    expect(res[0].inheritedFrom).toEqual({
      framework: "NIST_AI_RMF",
      code: "GOVERN-2.1",
    });
  });

  it("direct status wins over an inherited one (same usecase)", async () => {
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: ORG,
        name: "uc-both",
        ownerId: USER,
        lifecycleStage: "production",
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    await prisma.usecaseControlStatus.create({
      data: {
        orgId: ORG,
        usecaseId: uc.id,
        controlId: practiceId,
        status: "in_progress",
      },
    });
    await prisma.usecaseControlStatus.create({
      data: {
        orgId: ORG,
        usecaseId: uc.id,
        controlId: nistId,
        status: "satisfied",
      },
    });
    const res = await resolvePracticeStatuses(ORG, practiceId);
    const row = res.find((r) => r.usecaseId === uc.id)!;
    expect(row.status).toBe("in_progress");
    expect(row.source).toBe("direct");
  });

  it("does NOT inherit from a related (non-equivalent) mapping", async () => {
    await statusRow(isoId, "satisfied");
    const res = await resolvePracticeStatuses(ORG, practiceId);
    expect(res).toHaveLength(0);
  });

  it("excludes not_applicable target rows from inheritance", async () => {
    await statusRow(nistId, "not_applicable");
    const res = await resolvePracticeStatuses(ORG, practiceId);
    expect(res).toHaveLength(0);
  });

  it("no-crosswalk practice returns only its direct rows (degenerate)", async () => {
    const lone = await ctl("MINDFORGE", "MindForge", "C99-P9");
    await statusRow(lone.id, "satisfied");
    const res = await resolvePracticeStatuses(ORG, lone.id);
    expect(res).toHaveLength(1);
    expect(res[0].source).toBe("direct");
    await prisma.controlCrosswalk.deleteMany({
      where: { sourceControlId: lone.id },
    });
  });
});
