import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { aggregate } from "./aggregator";
import { euAiActTemplate } from "./templates/eu-ai-act";

const ORG = "org-euobl-test";
const USER = "user-euobl-test";
const RISK_CODE = "EU-TEST-RISK-1";
const PERIOD = { start: new Date(0), end: new Date() };
const GEN_BY = { id: USER, name: "Tester" };

let art9ControlId: string;

async function makeUsecase(name: string): Promise<string> {
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: ORG,
      name,
      ownerId: USER,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  return uc.id;
}

async function setControlStatus(
  usecaseId: string,
  status:
    "satisfied" | "not_started" | "not_applicable" | "in_progress" | "failed",
) {
  await prisma.usecaseControlStatus.create({
    data: { orgId: ORG, usecaseId, controlId: art9ControlId, status },
  });
}

function art9(data: Awaited<ReturnType<typeof aggregate>>) {
  return data.controls.find((c) => c.id === "Art.9")!;
}

beforeEach(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "EUObl Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "euobl@test.local", name: "Tester" },
  });

  // Shared EU_AI_ACT framework + ART-9 control (upsert; not deleted in cleanup)
  const fw = await prisma.riskFramework.upsert({
    where: { code: "EU_AI_ACT" },
    update: {},
    create: { code: "EU_AI_ACT", name: "EU AI Act (test)", version: "test" },
  });
  const control = await prisma.riskControl.upsert({
    where: { frameworkId_code: { frameworkId: fw.id, code: "ART-9" } },
    update: {},
    create: {
      frameworkId: fw.id,
      code: "ART-9",
      title: "Risk Management System",
      description: "test",
      severity: "medium",
    },
  });
  art9ControlId = control.id;
});

afterEach(async () => {
  // org-scoped rows (catalog link/risk cascade clean child rows)
  await prisma.nemoGuardrailEvidence.deleteMany({ where: { orgId: ORG } });
  await prisma.usecaseCatalogRiskLink.deleteMany({ where: { orgId: ORG } });
  await prisma.riskCatalog.deleteMany({ where: { orgId: ORG } });
  await prisma.usecaseControlStatus.deleteMany({ where: { orgId: ORG } });
  await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
  await prisma.user.delete({ where: { id: USER } }).catch(() => {});
  // framework/control are shared global rows — intentionally left in place
});

describe("aggregate – eu_obligation", () => {
  it("implemented when all usecases' ART-9 status is satisfied", async () => {
    const u1 = await makeUsecase("u1");
    const u2 = await makeUsecase("u2");
    await setControlStatus(u1, "satisfied");
    await setControlStatus(u2, "satisfied");

    const data = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template: euAiActTemplate,
      generatedBy: GEN_BY,
    });
    const c = art9(data);
    expect(c.status).toBe("implemented");
    expect(c.evidenceCount).toBe(2);
  });

  it("partial when some satisfied and some not", async () => {
    const u1 = await makeUsecase("u1");
    const u2 = await makeUsecase("u2");
    await setControlStatus(u1, "satisfied");
    await setControlStatus(u2, "not_started");

    const data = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template: euAiActTemplate,
      generatedBy: GEN_BY,
    });
    expect(art9(data).status).toBe("partial");
  });

  it("not-implemented when no control status rows exist", async () => {
    await makeUsecase("u1");

    const data = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template: euAiActTemplate,
      generatedBy: GEN_BY,
    });
    expect(art9(data).status).toBe("not-implemented");
  });

  it("n/a when all rows are not_applicable", async () => {
    const u1 = await makeUsecase("u1");
    await setControlStatus(u1, "not_applicable");

    const data = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template: euAiActTemplate,
      generatedBy: GEN_BY,
    });
    expect(art9(data).status).toBe("n/a");
  });

  it("attaches a linked EU_AI_ACT catalog risk as evidence without affecting status", async () => {
    const u1 = await makeUsecase("u1");
    await setControlStatus(u1, "satisfied");

    const risk = await prisma.riskCatalog.create({
      data: {
        source: "EU_AI_ACT",
        code: RISK_CODE,
        orgId: ORG,
        title: "Test high-risk profiling",
        summary: "s",
        description: "d",
      },
    });
    await prisma.riskCatalogMitigation.create({
      data: { riskCatalogId: risk.id, controlId: art9ControlId },
    });
    await prisma.usecaseCatalogRiskLink.create({
      data: {
        orgId: ORG,
        usecaseId: u1,
        riskCatalogId: risk.id,
        severity: "high",
        source: "manual",
        acceptedById: USER,
      },
    });

    const data = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template: euAiActTemplate,
      generatedBy: GEN_BY,
    });
    const c = art9(data);
    expect(c.status).toBe("implemented"); // status unaffected by evidence
    const ev = c.evidenceItems.find((e) => e.kind === "catalog_risk");
    expect(ev).toBeTruthy();
    expect(ev?.ref).toContain(RISK_CODE);
  });

  it("attaches nemo_guardrail evidence without affecting status", async () => {
    const u1 = await makeUsecase("u1");
    await setControlStatus(u1, "satisfied");

    await prisma.nemoGuardrailEvidence.create({
      data: {
        orgId: ORG,
        obligationCode: "ART-9",
        configRef: "nemo-configs/hitl-killswitch",
        approvalGatePassed: true,
        killSwitchPassed: true,
        transcript: {},
        createdBy: USER,
      },
    });

    const data = await aggregate({
      orgId: ORG,
      period: PERIOD,
      template: euAiActTemplate,
      generatedBy: GEN_BY,
    });
    const c = art9(data);
    expect(c.status).toBe("implemented"); // status unaffected by evidence
    expect(c.evidenceCount).toBe(1); // additive item does not change count
    const ev = c.evidenceItems.find((e) => e.kind === "nemo_guardrail");
    expect(ev).toBeTruthy();
    expect(ev?.ref).toContain("nemo-configs/hitl-killswitch");
    expect(ev?.ref).toContain("approval gate: pass");
    expect(ev?.ref).toContain("kill switch: pass");
  });
});
