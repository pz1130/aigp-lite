// @vitest-environment node
// This test exercises the DB + audit hash chain (node:crypto). Run under the
// node environment — the repo's default jsdom env strips node built-ins, and
// under Node 26 Vite externalizes node:crypto in jsdom so createHash is undefined.
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createVendor,
  getVendor,
  updateVendor,
  upsertAnswers,
  setRatingOverride,
  clearOverride,
  linkUsecase,
  unlinkUsecase,
  listVendors,
  VendorError,
} from "./service";

const ORG = "org-vendor-test";
const USER = "user-vendor-test";

async function makeUsecase(id: string) {
  await prisma.aiUsecase.upsert({
    where: { id },
    update: {},
    create: {
      id,
      orgId: ORG,
      name: `uc-${id}`,
      ownerId: USER,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
}

beforeAll(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Vendor Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "vendor@test.local", name: "Vendor Tester" },
  });
});

describe("vendor service", () => {
  it("creates a vendor with a null computed rating", async () => {
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name: `V-${Date.now()}`, vendorType: "model_provider" },
    });
    expect(v.computedRating).toBeNull();
  });

  it("recomputes the rating and stamps assessedBy on upsertAnswers", async () => {
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name: `V-${Date.now()}-a`, vendorType: "tooling_vendor" },
    });
    const updated = await upsertAnswers({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
      answers: [
        { itemCode: "DP-1", status: "yes" },
        { itemCode: "SEC-1", status: "no" }, // critical no
      ],
    });
    expect(updated.computedRating).toBe("critical"); // 1/13 coverage = 8% -> critical
    expect(updated.assessedById).toBe(USER);
    expect(updated.assessedAt).not.toBeNull();
  });

  it("rejects an unknown item code", async () => {
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name: `V-${Date.now()}-b`, vendorType: "tooling_vendor" },
    });
    await expect(
      upsertAnswers({
        orgId: ORG,
        actorId: USER,
        ip: "127.0.0.1",
        vendorId: v.id,
        answers: [{ itemCode: "NOPE-1", status: "yes" }],
      }),
    ).rejects.toBeInstanceOf(VendorError);
  });

  it("rejects an item that does not apply to the vendor type", async () => {
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name: `V-${Date.now()}-c`, vendorType: "data_vendor" },
    });
    await expect(
      upsertAnswers({
        orgId: ORG,
        actorId: USER,
        ip: "127.0.0.1",
        vendorId: v.id,
        answers: [{ itemCode: "MOD-1", status: "yes" }],
      }),
    ).rejects.toBeInstanceOf(VendorError);
  });

  it("override wins, clearOverride reverts to computed", async () => {
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name: `V-${Date.now()}-d`, vendorType: "tooling_vendor" },
    });
    await upsertAnswers({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
      answers: [{ itemCode: "DP-1", status: "yes" }],
    });
    const over = await setRatingOverride({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
      rating: "low",
      reason: "manual review",
    });
    expect(over.ratingOverride).toBe("low");
    const cleared = await clearOverride({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
    });
    expect(cleared.ratingOverride).toBeNull();
  });

  it("links and unlinks a use case", async () => {
    await makeUsecase("uc-vendor-1");
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name: `V-${Date.now()}-e`, vendorType: "model_provider" },
    });
    await linkUsecase({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
      usecaseId: "uc-vendor-1",
    });
    const withLink = await getVendor(ORG, v.id);
    expect(withLink!.usecases.map((l) => l.usecaseId)).toContain("uc-vendor-1");
    await unlinkUsecase({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
      usecaseId: "uc-vendor-1",
    });
    const after = await getVendor(ORG, v.id);
    expect(after!.usecases.map((l) => l.usecaseId)).not.toContain(
      "uc-vendor-1",
    );
  });

  it("persists structured contract/residency fields on create and update", async () => {
    const renewal = new Date("2027-01-15");
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: {
        name: `V-${Date.now()}-contract`,
        vendorType: "model_provider",
        dataResidency: "EU (Frankfurt)",
        contractRenewalDate: renewal,
        modelChangeNotice: true,
      },
    });
    expect(v.dataResidency).toBe("EU (Frankfurt)");
    expect(v.contractRenewalDate?.toISOString()).toBe(renewal.toISOString());
    expect(v.modelChangeNotice).toBe(true);

    // Partial update: only flip the flag; residency/date must be preserved.
    const updated = await updateVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
      input: { modelChangeNotice: false },
    });
    expect(updated.modelChangeNotice).toBe(false);
    expect(updated.dataResidency).toBe("EU (Frankfurt)");
    expect(updated.contractRenewalDate?.toISOString()).toBe(
      renewal.toISOString(),
    );

    // Explicit null clears the date.
    const cleared = await updateVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      vendorId: v.id,
      input: { contractRenewalDate: null },
    });
    expect(cleared.contractRenewalDate).toBeNull();
  });

  it("defaults modelChangeNotice to false when omitted", async () => {
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name: `V-${Date.now()}-default`, vendorType: "data_vendor" },
    });
    expect(v.modelChangeNotice).toBe(false);
    expect(v.dataResidency).toBeNull();
    expect(v.contractRenewalDate).toBeNull();
  });

  it("writes an audit row on create", async () => {
    const name = `V-${Date.now()}-f`;
    await createVendor({
      orgId: ORG,
      actorId: USER,
      ip: "127.0.0.1",
      input: { name, vendorType: "model_provider" },
    });
    const row = await prisma.auditLog.findFirst({
      where: { orgId: ORG, action: "vendor.create", resourceType: "vendor" },
      orderBy: { seqNum: "desc" },
    });
    expect(row).not.toBeNull();
  });

  it("listVendors is org-scoped", async () => {
    const rows = await listVendors(ORG);
    expect(rows.every((v) => v.orgId === ORG)).toBe(true);
  });
});
