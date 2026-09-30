import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";

const ORG = "org-vendor-router";
const USER = "user-vendor-router";

function caller(role: string) {
  return appRouter.createCaller({
    session: { orgId: ORG, userId: USER, role },
    ip: "127.0.0.1",
    db: prisma,
  } as never);
}

beforeAll(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Vendor Router Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "vr@test.local", name: "VR" },
  });
});

describe("vendor router", () => {
  it("ai_owner can create and list vendors", async () => {
    const c = caller("ai_owner");
    const created = await c.vendor.create({
      name: `R-${Date.now()}`,
      vendorType: "model_provider",
    });
    expect(created.id).toBeTruthy();
    const list = await c.vendor.list();
    expect(list.some((v) => v.id === created.id)).toBe(true);
  });

  it("viewer cannot create a vendor", async () => {
    const c = caller("viewer");
    await expect(
      c.vendor.create({
        name: `X-${Date.now()}`,
        vendorType: "model_provider",
      }),
    ).rejects.toThrow();
  });

  it("maps VendorError to BAD_REQUEST", async () => {
    const c = caller("ai_owner");
    const v = await c.vendor.create({
      name: `R-${Date.now()}-b`,
      vendorType: "data_vendor",
    });
    await expect(
      c.vendor.upsertAnswers({
        vendorId: v.id,
        answers: [{ itemCode: "MOD-1", status: "yes" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
