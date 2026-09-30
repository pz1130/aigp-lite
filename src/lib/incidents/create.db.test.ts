import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createIncident } from "./create";

const TAG = "createinc-test";

afterAll(async () => {
  await prisma.incident.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.membership.deleteMany({
    where: { user: { email: { startsWith: TAG } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
});

describe("createIncident", () => {
  it("creates an open incident with the given severity/category and external refs", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG}-org` },
    });
    const user = await prisma.user.create({
      data: { email: `${TAG}-u@example.com`, name: "T", passwordHash: "x" },
    });

    const incident = await createIncident({
      orgId: org.id,
      title: `${TAG} external escalation`,
      severity: "high",
      category: "capability_breach",
      openedById: user.id,
      rootCause: "reported jailbreak",
      externalRefs: { externalReportId: "er_123" },
      auditAction: "incident.opened_from_external_report",
    });

    expect(incident.status).toBe("open");
    expect(incident.severity).toBe("high");
    expect(incident.category).toBe("capability_breach");
    expect(
      (incident.externalRefs as Record<string, unknown>).externalReportId,
    ).toBe("er_123");
  });
});
