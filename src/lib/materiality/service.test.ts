import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  getMateriality,
  upsertMateriality,
  setOverride,
  clearOverride,
} from "./service";

const ORG = "mat-svc-org";
const USER = "mat-svc-user";

async function makeUsecase(
  id: string,
  autonomyLevel:
    "assistant" | "simple_agent" | "collaborative_agent" | "agent_ecosystem",
) {
  await prisma.aiUsecase.upsert({
    where: { id },
    create: {
      id,
      orgId: ORG,
      name: id,
      ownerId: USER,
      lifecycleStage: "production",
      autonomyLevel,
      deploymentType: "built",
      description: "test usecase for materiality",
    },
    update: { autonomyLevel },
  });
}

beforeAll(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: ORG },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: USER },
    create: { id: USER, email: `${USER}@example.com`, name: USER },
    update: {},
  });
});

describe("materiality service", () => {
  it("upsert computes and persists the tier from inputs x autonomy", async () => {
    await makeUsecase("mat-uc-1", "simple_agent");
    const row = await upsertMateriality({
      orgId: ORG,
      usecaseId: "mat-uc-1",
      actorId: USER,
      inputs: {
        affectedParties: 2,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      },
    });
    expect(row.computedTier).toBe("high");
    expect(row.affectedParties).toBe(2);

    const fetched = await getMateriality(ORG, "mat-uc-1");
    expect(fetched?.computedTier).toBe("high");
  });

  it("recomputes the tier when inputs change", async () => {
    await makeUsecase("mat-uc-2", "assistant");
    await upsertMateriality({
      orgId: ORG,
      usecaseId: "mat-uc-2",
      actorId: USER,
      inputs: {
        affectedParties: 0,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      },
    });
    const updated = await upsertMateriality({
      orgId: ORG,
      usecaseId: "mat-uc-2",
      actorId: USER,
      inputs: {
        affectedParties: 3,
        decisionConsequence: 3,
        financialSafety: 3,
        dataSensitivity: 3,
      },
    });
    expect(updated.computedTier).toBe("high");
  });

  it("set and clear override; effective derives in code", async () => {
    await makeUsecase("mat-uc-3", "assistant");
    await upsertMateriality({
      orgId: ORG,
      usecaseId: "mat-uc-3",
      actorId: USER,
      inputs: {
        affectedParties: 0,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      },
    });
    const overridden = await setOverride({
      orgId: ORG,
      usecaseId: "mat-uc-3",
      actorId: USER,
      tier: "critical",
      reason: "regulator flagged this system",
    });
    expect(overridden.tierOverride).toBe("critical");
    expect(overridden.computedTier).toBe("minimal");

    const cleared = await clearOverride({
      orgId: ORG,
      usecaseId: "mat-uc-3",
      actorId: USER,
    });
    expect(cleared.tierOverride).toBeNull();
    expect(cleared.overrideReason).toBeNull();
  });

  it("writes a materiality.assess audit row", async () => {
    await makeUsecase("mat-uc-4", "assistant");
    await upsertMateriality({
      orgId: ORG,
      usecaseId: "mat-uc-4",
      actorId: USER,
      inputs: {
        affectedParties: 1,
        decisionConsequence: 0,
        financialSafety: 0,
        dataSensitivity: 0,
      },
    });
    const audit = await prisma.auditLog.findFirst({
      where: {
        orgId: ORG,
        action: "materiality.assess",
        resourceType: "usecase_materiality",
      },
      orderBy: { seqNum: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects out-of-range inputs (Zod)", async () => {
    await makeUsecase("mat-uc-5", "assistant");
    await expect(
      upsertMateriality({
        orgId: ORG,
        usecaseId: "mat-uc-5",
        actorId: USER,
        inputs: {
          affectedParties: 4,
          decisionConsequence: 0,
          financialSafety: 0,
          dataSensitivity: 0,
        },
      }),
    ).rejects.toThrow();
  });
});
