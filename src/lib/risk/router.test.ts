import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import * as reportMod from "./report";

async function makeOrg(name = "RA-" + Date.now()) {
  return prisma.organization.create({ data: { name } });
}

async function makeUser(
  email = `ra-${Date.now()}-${Math.random().toString(36).slice(2)}@t.local`,
) {
  return prisma.user.create({ data: { email, name: "RA", passwordHash: "x" } });
}

async function addMember(
  orgId: string,
  userId: string,
  role: "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer",
) {
  return prisma.membership.create({ data: { orgId, userId, role } });
}

function ctxFor(
  orgId: string,
  userId: string,
  email: string,
  role: "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer",
) {
  return {
    db: prisma,
    session: { orgId, userId, email, role },
    ip: "127.0.0.1",
  } as const;
}

describe("risk.assess — PDF generation failures", () => {
  it("does not block the assessment but logs the error", async () => {
    const org = await makeOrg();
    const user = await makeUser();
    await addMember(org.id, user.id, "admin");
    const usecase = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        ownerId: user.id,
        name: "UC",
        autonomyLevel: "assistant",
        deploymentType: "built",
        description: "x".repeat(50),
      },
    });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const renderSpy = vi
      .spyOn(reportMod, "renderAssessmentPdf")
      .mockRejectedValueOnce(new Error("simulated render fail"));

    const caller = appRouter.createCaller(
      ctxFor(org.id, user.id, user.email, "admin"),
    );
    const result = await caller.risk.assess({
      usecaseId: usecase.id,
      notes: "ok",
    });

    expect(result.id).toBeTruthy();
    const row = await prisma.usecaseRiskAssessment.findUnique({
      where: { id: result.id },
    });
    expect(row?.pdfFileKey).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    const [tag] = errSpy.mock.calls[0];
    expect(String(tag)).toMatch(/risk\.assess.*PDF/i);

    renderSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("risk.regeneratePdf", () => {
  it("regenerates and stores a PDF for an assessment without one", async () => {
    const org = await makeOrg();
    const user = await makeUser();
    await addMember(org.id, user.id, "admin");
    const usecase = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        ownerId: user.id,
        name: "UC",
        autonomyLevel: "assistant",
        deploymentType: "built",
        description: "x".repeat(50),
      },
    });
    const assessment = await prisma.usecaseRiskAssessment.create({
      data: {
        orgId: org.id,
        usecaseId: usecase.id,
        assessedById: user.id,
        scoreInt: 30,
        level: "low",
        notes: "",
      },
    });

    const caller = appRouter.createCaller(
      ctxFor(org.id, user.id, user.email, "admin"),
    );
    const result = await caller.risk.regeneratePdf({
      assessmentId: assessment.id,
    });
    expect(result.pdfFileKey).toBeTruthy();

    const reloaded = await prisma.usecaseRiskAssessment.findUnique({
      where: { id: assessment.id },
    });
    expect(reloaded?.pdfFileKey).toBe(result.pdfFileKey);

    const audit = await prisma.auditLog.findFirst({
      where: {
        orgId: org.id,
        action: "risk.assessment.pdf_regenerate",
        resourceId: assessment.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects callers without risk.write", async () => {
    const org = await makeOrg();
    const viewer = await makeUser();
    await addMember(org.id, viewer.id, "viewer");
    const owner = await makeUser();
    await addMember(org.id, owner.id, "viewer");
    const usecase = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        ownerId: owner.id,
        name: "UC",
        autonomyLevel: "assistant",
        deploymentType: "built",
        description: "x".repeat(50),
      },
    });
    const assessment = await prisma.usecaseRiskAssessment.create({
      data: {
        orgId: org.id,
        usecaseId: usecase.id,
        assessedById: owner.id,
        scoreInt: 10,
        level: "low",
        notes: "",
      },
    });

    const caller = appRouter.createCaller(
      ctxFor(org.id, viewer.id, viewer.email, "viewer"),
    );
    await expect(
      caller.risk.regeneratePdf({ assessmentId: assessment.id }),
    ).rejects.toThrow();
  });
});
