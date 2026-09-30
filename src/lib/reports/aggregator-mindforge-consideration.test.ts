import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { aggregate } from "./aggregator";
import type { ReportTemplate } from "./types";
import { upsertMateriality } from "@/lib/materiality/service";

const ORG = "org-mf-test";
const USER = "user-mf-test";
const PERIOD = { start: new Date("2000-01-01"), end: new Date("2100-01-01") };

const template: ReportTemplate = {
  id: "mindforge",
  displayKey: "reports.templates.mindforge",
  version: "test",
  controls: [
    {
      id: "C7",
      title: "Model Development & Validation",
      category: "3. AI Lifecycle Management",
      description: "Consideration C7 rollup.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C7" },
    },
  ],
};

let c7p1 = "";
let c7p2 = "";

async function ensureScaffold() {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "MF Test Org" },
  });
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: "mf@test.local", name: "MF Tester" },
  });
  const fw = await prisma.riskFramework.upsert({
    where: { code: "MINDFORGE" },
    update: {},
    create: {
      code: "MINDFORGE",
      name: "MindForge AI Risk Management",
      version: "test",
    },
  });
  const p1 = await prisma.riskControl.upsert({
    where: { frameworkId_code: { frameworkId: fw.id, code: "C7-P1" } },
    update: {},
    create: {
      frameworkId: fw.id,
      code: "C7-P1",
      title: "p1",
      description: "p1",
      severity: "medium",
      frameworkRefs: {},
      sourceUrl: "x",
    },
  });
  const p2 = await prisma.riskControl.upsert({
    where: { frameworkId_code: { frameworkId: fw.id, code: "C7-P2" } },
    update: {},
    create: {
      frameworkId: fw.id,
      code: "C7-P2",
      title: "p2",
      description: "p2",
      severity: "medium",
      frameworkRefs: {},
      sourceUrl: "x",
    },
  });
  c7p1 = p1.id;
  c7p2 = p2.id;
}

async function clearStatuses() {
  await prisma.usecaseCatalogRiskLink.deleteMany({ where: { orgId: ORG } });
  await prisma.usecaseMateriality.deleteMany({ where: { orgId: ORG } });
  await prisma.usecaseControlStatus.deleteMany({ where: { orgId: ORG } });
  await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
  await prisma.controlCrosswalk.deleteMany({
    where: { sourceControlId: { in: [c7p1, c7p2] } },
  });
}

async function setStatus(
  controlId: string,
  status:
    "satisfied" | "not_started" | "not_applicable" | "in_progress" | "failed",
) {
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId: ORG,
      name: `uc-${Math.random()}`,
      ownerId: USER,
      lifecycleStage: "production",
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  await prisma.usecaseControlStatus.create({
    data: { orgId: ORG, usecaseId: uc.id, controlId, status },
  });
  return uc.id;
}

async function runC7() {
  const data = await aggregate({
    orgId: ORG,
    period: PERIOD,
    template,
    generatedBy: { id: USER, name: "t" },
  });
  return data.controls.find((c) => c.id === "C7")!;
}

describe("mindforge_consideration aggregator", () => {
  beforeAll(async () => {
    await ensureScaffold();
  });
  beforeEach(async () => {
    await clearStatuses();
  });
  afterAll(async () => {
    await clearStatuses();
    await prisma.user.delete({ where: { id: USER } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: ORG } });
  });

  it("implemented: all C7-* rows satisfied", async () => {
    await setStatus(c7p1, "satisfied");
    await setStatus(c7p2, "satisfied");
    const c = await runC7();
    expect(c.status).toBe("implemented");
    expect(c.evidenceCount).toBe(2);
  });

  it("partial: mix of satisfied + not_started across the Consideration", async () => {
    await setStatus(c7p1, "satisfied");
    await setStatus(c7p2, "not_started");
    const c = await runC7();
    expect(c.status).toBe("partial");
  });

  it("not-implemented: controls exist but no status rows", async () => {
    const c = await runC7();
    expect(c.status).toBe("not-implemented");
  });

  it("n/a: all rows not_applicable", async () => {
    await setStatus(c7p1, "not_applicable");
    await setStatus(c7p2, "not_applicable");
    const c = await runC7();
    expect(c.status).toBe("n/a");
  });

  it("multi-control rollup spans different Practices (C7-P1 + C7-P2)", async () => {
    await setStatus(c7p1, "satisfied");
    await setStatus(c7p2, "not_started");
    const c = await runC7();
    expect(c.status).toBe("partial");
  });

  it("catalog risk linked to a C7 control surfaces as catalog_risk evidence", async () => {
    await setStatus(c7p1, "satisfied");

    const existingRisk = await prisma.riskCatalog.findFirst({
      where: { source: "MINDFORGE", code: "MF-R-FB-9", orgId: null },
    });
    const risk =
      existingRisk ??
      (await prisma.riskCatalog.create({
        data: {
          source: "MINDFORGE",
          code: "MF-R-FB-9",
          orgId: null,
          title: "Bias risk",
          summary: "s",
          description: "d",
          frameworkRefs: {},
          relatedRiskCodes: [],
          sourceUrl: "x",
        },
      }));
    await prisma.riskCatalogMitigation.deleteMany({
      where: { controlId: c7p1, riskCatalogId: risk.id },
    });
    await prisma.riskCatalogMitigation.create({
      data: { controlId: c7p1, riskCatalogId: risk.id },
    });
    const uc = await prisma.aiUsecase.create({
      data: {
        orgId: ORG,
        name: "uc-link",
        ownerId: USER,
        lifecycleStage: "production",
        autonomyLevel: "assistant",
        deploymentType: "built",
      },
    });
    await prisma.usecaseCatalogRiskLink.create({
      data: {
        orgId: ORG,
        usecaseId: uc.id,
        riskCatalogId: risk.id,
        severity: "high",
        source: "manual",
        acceptedById: USER,
      },
    });

    const c = await runC7();
    expect(
      c.evidenceItems.some(
        (e) => e.kind === "catalog_risk" && e.ref.startsWith("MF-R-FB-9"),
      ),
    ).toBe(true);
    expect(c.status).toBe("implemented");

    await prisma.riskCatalogMitigation.deleteMany({
      where: { riskCatalogId: risk.id, controlId: c7p1 },
    });
    await prisma.riskCatalog.delete({ where: { id: risk.id } }).catch(() => {});
  });

  it("a high-tier use case that is unsatisfied blocks 'implemented'", async () => {
    const uc = await setStatus(c7p1, "in_progress");
    await upsertMateriality({
      orgId: ORG,
      usecaseId: uc,
      actorId: USER,
      inputs: {
        affectedParties: 3,
        decisionConsequence: 3,
        financialSafety: 3,
        dataSensitivity: 3,
      },
    });
    const result = await runC7();
    expect(result.status).toBe("partial");
    expect(result.evidenceItems.some((i) => i.ref.includes("high"))).toBe(true);
  });

  it("a minimal use case gap does NOT block when material systems are covered", async () => {
    const critUc = await setStatus(c7p1, "satisfied");
    await upsertMateriality({
      orgId: ORG,
      usecaseId: critUc,
      actorId: USER,
      inputs: {
        affectedParties: 3,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      },
    });
    const minUc = await setStatus(c7p2, "in_progress");
    await upsertMateriality({
      orgId: ORG,
      usecaseId: minUc,
      actorId: USER,
      inputs: {
        affectedParties: 0,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      },
    });
    const result = await runC7();
    expect(result.status).toBe("implemented");
  });

  it("inherits status from an equivalent crosswalk target (raises rollup)", async () => {
    const nfw = await prisma.riskFramework.upsert({
      where: { code: "NIST_AI_RMF" },
      update: {},
      create: { code: "NIST_AI_RMF", name: "NIST", version: "test" },
    });
    const nctl = await prisma.riskControl.upsert({
      where: { frameworkId_code: { frameworkId: nfw.id, code: "GOVERN-2.1" } },
      update: {},
      create: {
        frameworkId: nfw.id,
        code: "GOVERN-2.1",
        title: "t",
        description: "d",
        severity: "medium",
        frameworkRefs: {},
        sourceUrl: "x",
      },
    });
    await prisma.controlCrosswalk.upsert({
      where: {
        sourceControlId_targetControlId: {
          sourceControlId: c7p1,
          targetControlId: nctl.id,
        },
      },
      update: { relation: "equivalent" },
      create: {
        sourceControlId: c7p1,
        targetControlId: nctl.id,
        relation: "equivalent",
      },
    });
    await setStatus(nctl.id, "satisfied");

    const c = await runC7();
    expect(c.status).toBe("implemented");
    expect(
      c.evidenceItems.some(
        (e) => e.kind === "crosswalk" && e.ref.includes("GOVERN-2.1"),
      ),
    ).toBe(true);
  });

  it("direct status on the practice beats an equivalent crosswalk target", async () => {
    const nfw = await prisma.riskFramework.findUniqueOrThrow({
      where: { code: "NIST_AI_RMF" },
    });
    const nctl = await prisma.riskControl.upsert({
      where: { frameworkId_code: { frameworkId: nfw.id, code: "GOVERN-2.1" } },
      update: {},
      create: {
        frameworkId: nfw.id,
        code: "GOVERN-2.1",
        title: "t",
        description: "d",
        severity: "medium",
        frameworkRefs: {},
        sourceUrl: "x",
      },
    });
    await prisma.controlCrosswalk.upsert({
      where: {
        sourceControlId_targetControlId: {
          sourceControlId: c7p1,
          targetControlId: nctl.id,
        },
      },
      update: { relation: "equivalent" },
      create: {
        sourceControlId: c7p1,
        targetControlId: nctl.id,
        relation: "equivalent",
      },
    });
    await setStatus(c7p1, "not_started");
    await setStatus(nctl.id, "satisfied");

    const c = await runC7();
    expect(c.status).not.toBe("implemented");
  });
});
