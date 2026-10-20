import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { ROLES, type Role } from "@/lib/rbac/roles";

// RiskFramework/RiskControl are one catalog shared by every tenant, so only
// admin may change it; per-org control statuses stay open to risk.write.
const TAG = "RISK-CAT";
const CODE = `${TAG}-${Date.now()}`;

let orgId: string;
let userId: string;
let usecaseId: string;

function caller(role: Role) {
  const ctx: TRPCContext = {
    session: { userId, orgId, role, email: `${role}@x` },
  };
  return appRouter.createCaller(ctx);
}

const nonAdmins = ROLES.filter((r) => r !== "admin");

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `${TAG}-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `rc-${Date.now()}@t.local`, name: TAG },
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: org.id,
      ownerId: user.id,
      name: "catalog test",
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  orgId = org.id;
  userId = user.id;
  usecaseId = uc.id;
});

afterAll(async () => {
  await prisma.organization.deleteMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.riskFramework.deleteMany({
    where: { code: { startsWith: TAG } },
  });
  await prisma.$disconnect();
});

describe("risk catalog — admin-only writes", () => {
  it("lets admin create, update and delete frameworks and controls", async () => {
    const admin = caller("admin");
    const fw = await admin.risk.frameworkCreate({
      code: `${CODE}-a`,
      name: "Catalog",
      version: "1",
    });
    await admin.risk.frameworkUpdate({ id: fw.id, name: "Catalog v2" });
    const ctl = await admin.risk.controlCreate({
      frameworkId: fw.id,
      code: "C-1",
      title: "First",
    });
    await admin.risk.controlUpdate({ id: ctl.id, title: "First v2" });
    await admin.risk.controlBatchCreate({
      frameworkId: fw.id,
      controls: [{ code: "C-2", title: "Second" }],
    });
    await admin.risk.controlDelete({ id: ctl.id });
    await admin.risk.frameworkDelete({ id: fw.id });
    expect(
      await prisma.riskFramework.findUnique({ where: { id: fw.id } }),
    ).toBeNull();
  });

  it.each(nonAdmins)("refuses every catalog write from %s", async (role) => {
    const fw = await prisma.riskFramework.create({
      data: { code: `${CODE}-${role}`, name: "Untouched", version: "1" },
    });
    const ctl = await prisma.riskControl.create({
      data: {
        frameworkId: fw.id,
        code: "C-1",
        title: "Untouched",
        description: "",
      },
    });
    const c = caller(role).risk;
    const attempts = [
      c.frameworkCreate({
        code: `${CODE}-${role}-new`,
        name: "x",
        version: "1",
      }),
      c.frameworkUpdate({ id: fw.id, name: "pwned" }),
      c.frameworkDelete({ id: fw.id }),
      c.controlCreate({ frameworkId: fw.id, code: "C-9", title: "x" }),
      c.controlUpdate({ id: ctl.id, title: "pwned" }),
      c.controlDelete({ id: ctl.id }),
      c.controlBatchCreate({
        frameworkId: fw.id,
        controls: [{ code: "C-8", title: "x" }],
      }),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toThrow(/lacks|FORBIDDEN/);
    }
    const after = await prisma.riskFramework.findUnique({
      where: { id: fw.id },
      include: { controls: true },
    });
    expect(after?.name).toBe("Untouched");
    expect(after?.controls.map((x) => x.title)).toEqual(["Untouched"]);
  });

  it("still lets risk_officer set a control status on its own usecase", async () => {
    const fw = await prisma.riskFramework.create({
      data: { code: `${CODE}-status`, name: "Status", version: "1" },
    });
    const ctl = await prisma.riskControl.create({
      data: {
        frameworkId: fw.id,
        code: "C-1",
        title: "Status",
        description: "",
      },
    });
    await caller("risk_officer").risk.setControlStatus({
      usecaseId,
      controlId: ctl.id,
      status: "satisfied",
    });
    expect(
      await prisma.usecaseControlStatus.count({
        where: { usecaseId, controlId: ctl.id },
      }),
    ).toBe(1);
  });
});
