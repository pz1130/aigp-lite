import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { aggregate } from "./aggregator";
import type { ReportTemplate } from "./types";
import { createVendor, upsertAnswers, linkUsecase } from "@/lib/vendor/service";

const ORG = "org-vendor-agg";
const USER = "user-vendor-agg";
const PERIOD = { start: new Date("2000-01-01"), end: new Date("2100-01-01") };

const template: ReportTemplate = {
  id: "mindforge",
  displayKey: "reports.templates.mindforge",
  version: "test",
  controls: [
    {
      id: "C13",
      title: "Third-Party and Outsourcing Management",
      category: "4. AI Operations & Monitoring",
      description: "Vendor due diligence rollup.",
      dataSource: "vendor_due_diligence",
      query: {},
    },
  ],
};

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
    create: { id: ORG, name: "Vendor Agg Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "va@test.local", name: "VA" },
  });
});

beforeEach(async () => {
  await prisma.vendorUsecaseLink.deleteMany({ where: { orgId: ORG } });
  await prisma.vendorDueDiligenceAnswer.deleteMany({
    where: { vendor: { orgId: ORG } },
  });
  await prisma.vendor.deleteMany({ where: { orgId: ORG } });
  await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
});

async function fullyVet(name: string) {
  const v = await createVendor({
    orgId: ORG,
    actorId: USER,
    input: { name, vendorType: "tooling_vendor" },
  });
  await upsertAnswers({
    orgId: ORG,
    actorId: USER,
    vendorId: v.id,
    answers: [
      { itemCode: "DP-1", status: "yes" },
      { itemCode: "DP-2", status: "yes" },
      { itemCode: "DP-3", status: "yes" },
      { itemCode: "DP-4", status: "yes" },
      { itemCode: "SEC-1", status: "yes" },
      { itemCode: "SEC-2", status: "yes" },
      { itemCode: "SEC-3", status: "yes" },
      { itemCode: "LEG-1", status: "yes" },
      { itemCode: "LEG-2", status: "yes" },
      { itemCode: "LEG-3", status: "yes" },
      { itemCode: "OPS-1", status: "yes" },
      { itemCode: "OPS-2", status: "yes" },
      { itemCode: "OPS-3", status: "yes" },
    ],
  });
  return v;
}

describe("aggregator: vendor_due_diligence (C13)", () => {
  it("no vendors linked to dev/prod use cases -> n/a", async () => {
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("n/a");
  });

  it("all relied-on vendors fully vetted & none high/critical -> implemented", async () => {
    await makeUsecase("uc-a");
    const v = await fullyVet(`Vetted-${Date.now()}`);
    await linkUsecase({
      orgId: ORG,
      actorId: USER,
      vendorId: v.id,
      usecaseId: "uc-a",
    });
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("implemented");
    expect(result.controls[0].evidenceCount).toBe(1);
  });

  it("a relied-on vendor with no answers -> not-implemented", async () => {
    await makeUsecase("uc-b");
    const v = await createVendor({
      orgId: ORG,
      actorId: USER,
      input: { name: `Raw-${Date.now()}`, vendorType: "tooling_vendor" },
    });
    await linkUsecase({
      orgId: ORG,
      actorId: USER,
      vendorId: v.id,
      usecaseId: "uc-b",
    });
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("not-implemented");
  });

  it("mix of vetted + unassessed -> partial", async () => {
    await makeUsecase("uc-c");
    const vetted = await fullyVet(`Vetted2-${Date.now()}`);
    const raw = await createVendor({
      orgId: ORG,
      actorId: USER,
      input: { name: `Raw2-${Date.now()}`, vendorType: "tooling_vendor" },
    });
    await linkUsecase({
      orgId: ORG,
      actorId: USER,
      vendorId: vetted.id,
      usecaseId: "uc-c",
    });
    await linkUsecase({
      orgId: ORG,
      actorId: USER,
      vendorId: raw.id,
      usecaseId: "uc-c",
    });
    const result = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template,
      generatedBy: { id: USER, name: "t" },
    });
    expect(result.controls[0].status).toBe("partial");
  });
});
