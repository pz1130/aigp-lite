import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { reportsRouter } from "./router";
import type { Role } from "@/lib/rbac/roles";

const ORG = "org-r-test";

function caller(role: Role = "admin") {
  return reportsRouter.createCaller({
    session: { orgId: ORG, userId: "u1", role, email: "u@e" },
    ip: "127.0.0.1",
    userAgent: "t",
  });
}

beforeEach(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Test" },
  });
  await prisma.user.upsert({
    where: { id: "u1" },
    update: {},
    create: { id: "u1", email: "u@e", name: "U" },
  });
  await prisma.report.deleteMany({ where: { orgId: ORG } });
});
afterEach(async () => {
  await prisma.report.deleteMany({ where: { orgId: ORG } });
});

describe("reportsRouter — read", () => {
  it("templates returns 6 entries", async () => {
    const t = await caller().templates();
    expect(t.length).toBe(6);
    expect(t.map((x) => x.id).sort()).toEqual([
      "eu-ai-act",
      "iso-27001",
      "iso-42001",
      "mindforge",
      "nist-ai-rmf",
      "soc2-type2",
    ]);
  });

  it("list returns empty initially", async () => {
    const r = await caller().list({});
    expect(r.items.length).toBe(0);
  });

  it("viewer cannot delete", async () => {
    const row = await prisma.report.create({
      data: {
        orgId: ORG,
        templateId: "iso-27001",
        periodStart: new Date(0),
        periodEnd: new Date(),
        generatedBy: "u1",
      },
    });
    await expect(caller("viewer").delete({ id: row.id })).rejects.toThrow(
      /reports\.delete/,
    );
  });
});
