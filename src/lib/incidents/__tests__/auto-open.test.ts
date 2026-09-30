import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { maybeOpenIncident } from "../auto-open";
import { SYSTEM_USER_ID } from "@/lib/auth/system-user";
import * as dedupMod from "../dedup";

const ORG = "org-auto-test";

async function fresh() {
  await prisma.auditLog.deleteMany({ where: { orgId: ORG } });
  await prisma.incidentMergeSuggestion.deleteMany({ where: { orgId: ORG } });
  await prisma.incident.deleteMany({ where: { orgId: ORG } });
  await prisma.policyEvaluation.deleteMany({ where: { orgId: ORG } });
  await prisma.policy.deleteMany({ where: { orgId: ORG } });
  await prisma.aiUsecase.deleteMany({ where: { orgId: ORG } });
  await prisma.orgIncidentAutomationConfig.deleteMany({
    where: { orgId: ORG },
  });
  await prisma.organization.deleteMany({ where: { id: ORG } });
  await prisma.organization.create({ data: { id: ORG, name: "T" } });
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    create: {
      id: SYSTEM_USER_ID,
      email: "system@internal",
      name: "System",
      passwordHash: "x",
    },
    update: {},
  });
  vi.spyOn(dedupMod, "suggestDuplicates").mockResolvedValue([]);
}

async function mkUsecase(name = "U") {
  return prisma.aiUsecase.create({
    data: {
      orgId: ORG,
      name,
      description: "",
      ownerId: SYSTEM_USER_ID,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
}

async function setupBlockPolicyHit() {
  const usecase = await mkUsecase();
  const policy = await prisma.policy.create({
    data: {
      orgId: ORG,
      name: "P",
      description: "",
      ruleJson: {},
      severity: "high",
      enforcementMode: "block",
      scope: "output",
    },
  });
  const evalRow = await prisma.policyEvaluation.create({
    data: {
      orgId: ORG,
      policyId: policy.id,
      requestId: "r1",
      hit: true,
      snippet: "x",
    },
  });
  return { ...evalRow, policy, usecase, usecaseId: usecase.id };
}

beforeEach(fresh);

describe("maybeOpenIncident", () => {
  it("returns null when autoOpenEnabled=false", async () => {
    await prisma.orgIncidentAutomationConfig.create({
      data: { orgId: ORG, autoOpenEnabled: false },
    });
    const e = await setupBlockPolicyHit();
    expect(
      await maybeOpenIncident({ ...e, usecaseId: e.usecaseId }),
    ).toBeNull();
  });

  it("opens an incident on block trigger with classified category/severity", async () => {
    const e = await setupBlockPolicyHit();
    const inc = await maybeOpenIncident({ ...e, usecaseId: e.usecaseId });
    expect(inc).not.toBeNull();
    expect(inc!.category).toBe("data_leak");
    expect(inc!.severity).toBe("critical");
    expect(inc!.autoCreatedFromPolicyEvalId).toBe(e.id);
    expect(inc!.openedById).toBe(SYSTEM_USER_ID);
  });

  it("attaches to an existing open incident for same policy+usecase within 24h instead of opening a new one", async () => {
    const e1 = await setupBlockPolicyHit();
    const first = await maybeOpenIncident({ ...e1, usecaseId: e1.usecaseId });

    const e2 = await prisma.policyEvaluation.create({
      data: {
        orgId: ORG,
        policyId: e1.policyId,
        requestId: "r2",
        hit: true,
        snippet: "y",
      },
    });
    const second = await maybeOpenIncident({
      ...e2,
      policy: e1.policy,
      usecase: e1.usecase,
      usecaseId: e1.usecaseId,
    });
    expect(second!.id).toBe(first!.id);
    const count = await prisma.incident.count({ where: { orgId: ORG } });
    expect(count).toBe(1);
  });

  it("does not fire on warn-mode unless burst threshold hit", async () => {
    const usecase = await mkUsecase();
    const policy = await prisma.policy.create({
      data: {
        orgId: ORG,
        name: "P",
        description: "",
        ruleJson: {},
        severity: "medium",
        enforcementMode: "warn",
        scope: "output",
      },
    });
    const single = await prisma.policyEvaluation.create({
      data: {
        orgId: ORG,
        policyId: policy.id,
        requestId: "r-single",
        hit: true,
        snippet: "x",
      },
    });
    expect(
      await maybeOpenIncident({
        ...single,
        policy,
        usecase,
        usecaseId: usecase.id,
      }),
    ).toBeNull();
  });

  it("fires burst when threshold hits exist in window", async () => {
    await prisma.orgIncidentAutomationConfig.create({
      data: { orgId: ORG, hitBurstThreshold: 3, hitBurstWindowMin: 10 },
    });
    const usecase = await mkUsecase();
    const policy = await prisma.policy.create({
      data: {
        orgId: ORG,
        name: "P",
        description: "",
        ruleJson: {},
        severity: "medium",
        enforcementMode: "warn",
        scope: "output",
      },
    });
    for (let i = 0; i < 3; i++) {
      await prisma.policyEvaluation.create({
        data: {
          orgId: ORG,
          policyId: policy.id,
          requestId: `r${i}`,
          hit: true,
          snippet: "x",
        },
      });
    }
    const trigger = await prisma.policyEvaluation.create({
      data: {
        orgId: ORG,
        policyId: policy.id,
        requestId: "r-trigger",
        hit: true,
        snippet: "x",
      },
    });
    const inc = await maybeOpenIncident({
      ...trigger,
      policy,
      usecase,
      usecaseId: usecase.id,
    });
    expect(inc).not.toBeNull();
    expect(inc!.category).toBe("trust_failure");
  });
});
