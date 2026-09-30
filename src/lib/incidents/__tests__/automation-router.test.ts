import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { incidentAutomationRouter } from "../automation-router";

const ORG = "org-cfg-rt";
const USER = "u-cfg-rt";

async function fresh() {
  await prisma.orgIncidentAutomationConfig.deleteMany({
    where: { orgId: ORG },
  });
  await prisma.organization.deleteMany({ where: { id: ORG } });
  await prisma.user.deleteMany({ where: { id: USER } });
  await prisma.organization.create({ data: { id: ORG, name: "T" } });
  await prisma.user.create({
    data: { id: USER, email: "u@t", name: "U", passwordHash: "x" },
  });
  await prisma.membership.create({
    data: { orgId: ORG, userId: USER, role: "admin" },
  });
}

function ctx(role: "admin" | "viewer" = "admin") {
  return {
    db: prisma,
    session: { orgId: ORG, userId: USER, role },
    ip: "127.0.0.1",
  } as never;
}

beforeEach(fresh);

describe("incidentAutomationRouter.get", () => {
  it("returns defaults when no row exists", async () => {
    const r = await incidentAutomationRouter.createCaller(ctx()).get();
    expect(r.autoOpenEnabled).toBe(true);
    expect(r.dedupSimilarityThreshold).toBeCloseTo(0.85);
  });
});

describe("incidentAutomationRouter.update", () => {
  it("admin can update", async () => {
    const r = await incidentAutomationRouter.createCaller(ctx()).update({
      autoOpenEnabled: false,
      dedupSimilarityThreshold: 0.9,
    });
    expect(r.autoOpenEnabled).toBe(false);
    expect(r.dedupSimilarityThreshold).toBeCloseTo(0.9);
  });

  it("viewer is rejected", async () => {
    await expect(
      incidentAutomationRouter
        .createCaller(ctx("viewer"))
        .update({ autoOpenEnabled: false }),
    ).rejects.toThrow();
  });
});
