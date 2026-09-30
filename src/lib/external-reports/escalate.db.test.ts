import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import {
  createExternalReport,
  escalateReport,
  resolveUsecaseByToken,
  setPublicIntake,
} from "./service";

const TAG = "er-escalate-test";

afterAll(async () => {
  await prisma.incident.deleteMany({
    where: { title: { startsWith: `External report: ${TAG}` } },
  });
  await prisma.externalReport.deleteMany({
    where: { title: { startsWith: TAG } },
  });
  await prisma.aiUsecase.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.membership.deleteMany({
    where: { user: { email: { startsWith: TAG } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
});

describe("escalateReport", () => {
  it("creates a linked incident and moves the report to accepted", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-org` },
    });
    const user = await prisma.user.create({
      data: { email: `${TAG}-u@e.com`, name: "T", passwordHash: "x" },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-sys`,
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });

    const db = withOrg(prisma, org.id);
    const { token } = await setPublicIntake(db, {
      usecaseId: uc.id,
      orgId: org.id,
      enabled: true,
    });
    const resolved = await resolveUsecaseByToken(token!);
    expect(resolved?.id).toBe(uc.id);

    const created = await createExternalReport({
      usecase: resolved!,
      data: {
        type: "vulnerability",
        title: `${TAG} jailbreak`,
        description: "d",
        reproSteps: "",
      },
      ip: "203.0.113.9",
      userAgent: "vitest",
    });

    const { report, incidentId } = await escalateReport(db, {
      id: created.id,
      orgId: org.id,
      userId: user.id,
    });
    expect(report.status).toBe("accepted");
    expect(report.escalatedIncidentId).toBe(incidentId);

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });
    expect(incident?.category).toBe("capability_breach");
    expect(incident?.severity).toBe("high");
    expect(
      (incident?.externalRefs as Record<string, unknown>).externalReportId,
    ).toBe(created.id);
  });

  it("refuses to escalate a terminal report", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-org2` },
    });
    const user = await prisma.user.create({
      data: { email: `${TAG}-u2@e.com`, name: "T", passwordHash: "x" },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: `${TAG}-sys2`,
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    const report = await prisma.externalReport.create({
      data: {
        orgId: org.id,
        usecaseId: uc.id,
        type: "vulnerability",
        status: "rejected",
        title: `${TAG} x`,
        description: "d",
      },
    });
    const db = withOrg(prisma, org.id);
    await expect(
      escalateReport(db, { id: report.id, orgId: org.id, userId: user.id }),
    ).rejects.toThrow();
  });
});
