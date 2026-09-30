import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

const ORG = "TXR-MODEL-" + Date.now();

async function cleanup() {
  await prisma.txrReport.deleteMany({
    where: { title: { startsWith: "TXR-MODEL-TEST" } },
  });
  await prisma.aiUsecase.deleteMany({
    where: { name: { startsWith: "TXR-MODEL-" } },
  });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: "TXR-MODEL-" } },
  });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("TxrReport model", () => {
  it("creates a draft report with empty sections and enforces version uniqueness", async () => {
    const org = await prisma.organization.create({ data: { name: ORG } });
    const user = await prisma.user.create({
      data: { email: `m-${Date.now()}@t.local`, name: "M", passwordHash: "x" },
    });
    const r = await prisma.txrReport.create({
      data: {
        orgId: org.id,
        usecaseId: null,
        version: 1,
        title: "TXR-MODEL-TEST report",
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-06-30"),
        periodLabel: "2026 H1",
        createdById: user.id,
      },
    });
    expect(r.status).toBe("draft");
    expect(r.sections).toEqual({});
    expect(r.snapshot).toBeNull();

    // Postgres treats NULL as distinct in unique indexes, so the
    // (orgId, usecaseId, version) constraint is only enforceable when
    // usecaseId is non-null. Exercise that case explicitly here (the same
    // limitation already exists in the sibling FrtAssessment model).
    const usecase = await prisma.aiUsecase.create({
      data: {
        orgId: org.id,
        name: "TXR-MODEL-usecase",
        ownerId: user.id,
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    await prisma.txrReport.create({
      data: {
        orgId: org.id,
        usecaseId: usecase.id,
        version: 1,
        title: "TXR-MODEL-TEST scoped report",
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-06-30"),
        periodLabel: "2026 H1",
        createdById: user.id,
      },
    });

    await expect(
      prisma.txrReport.create({
        data: {
          orgId: org.id,
          usecaseId: usecase.id,
          version: 1,
          title: "TXR-MODEL-TEST dup",
          periodStart: new Date("2026-01-01"),
          periodEnd: new Date("2026-06-30"),
          periodLabel: "2026 H1",
          createdById: user.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects two org-level (null-usecase) reports sharing a version", async () => {
    const org = await prisma.organization.create({
      data: { name: ORG + "-dup" },
    });
    const user = await prisma.user.create({
      data: {
        email: `dup-${Date.now()}@t.local`,
        name: "D",
        passwordHash: "x",
      },
    });
    await prisma.txrReport.create({
      data: {
        orgId: org.id,
        usecaseId: null,
        version: 1,
        title: "TXR-MODEL-TEST Org TXR A",
        periodLabel: "2026 H1",
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-06-30"),
        status: "draft",
        createdById: user.id,
      },
    });
    await expect(
      prisma.txrReport.create({
        data: {
          orgId: org.id,
          usecaseId: null,
          version: 1,
          title: "TXR-MODEL-TEST Org TXR B",
          periodLabel: "2026 H1",
          periodStart: new Date("2026-01-01"),
          periodEnd: new Date("2026-06-30"),
          status: "draft",
          createdById: user.id,
        },
      }),
    ).rejects.toThrow();
  });
});
