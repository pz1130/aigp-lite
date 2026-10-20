import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "@/lib/dossier/readiness";
import type { DossierSnapshot } from "@/lib/dossier/types";

function baseSnapshot(over: Partial<DossierSnapshot> = {}): DossierSnapshot {
  const snapshot: DossierSnapshot = {
    system: {
      id: "uc1",
      name: "Sys",
      ownerId: "u1",
      ownerName: "O",
      lifecycleStage: "development",
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "d",
      modelCardMd: "# card",
      intendedUseMd: "# intended use",
      prohibitedUseMd: "# prohibited use",
      humanOversightAttested: true,
      humanOversightAttestedByName: "O",
      humanOversightAttestedAt: new Date(),
      updatedAt: new Date(),
      sunsetDate: null,
      deprecatedAt: null,
      deprecatedByName: null,
      deprecationReason: "",
    },
    classification: {
      present: true,
      euAiActCategory: "minimal",
      isHighRisk: false,
      containsPii: false,
      dataSensitivity: null,
    },
    risk: { hasAssessment: true, controlsNotSatisfied: 0 },
    regulatoryRisks: { total: 0, withoutRationale: 0 },
    dataGovernance: { dataSourceCount: 2 },
    documentation: { hasModelCard: true, versionCount: 1 },
    logging: { invocationCount: 5 },
    fria: { approvedCount: 1 },
    transparency: { publishedCount: 1 },
    redteam: { completedCount: 1 },
    externalRedteam: { attestationCount: 1 },
    drift: { benchmarkCount: 1, completedRunCount: 1 },
    alignmentAudit: { status: "pass" },
    incidents: { openHighOrCritical: 0 },
    capability: { assessed: true, effectiveTier: 0 },
    modelRef: "v1",
    goLive: null,
  };
  return { ...snapshot, ...over } as DossierSnapshot;
}

describe("evaluateReadiness", () => {
  it("does not treat an unknown category as completed classification", () => {
    const snapshot = baseSnapshot();
    snapshot.classification.euAiActCategory = "unknown";
    const result = evaluateReadiness(snapshot);
    expect(result.checks.find((c) => c.id === "classified")).toMatchObject({
      status: "fail",
      deepLink: "/inventory/uc1/edit",
    });
    expect(
      result.checks.find((c) => c.id === "risk_management")?.deepLink,
    ).toBe("/risk/usecases/uc1");
  });
  it("evaluates the six MVP checks", () => {
    const result = evaluateReadiness(baseSnapshot());

    expect(result.checks.map((check) => check.id)).toEqual([
      "classified",
      "risk_management",
      "regulatory_risks",
      "documentation",
      "fria",
      "human_oversight",
    ]);
    expect(result.state).toBe("ready");
  });

  it("blocks an unclassified system", () => {
    const result = evaluateReadiness(
      baseSnapshot({
        classification: {
          present: false,
          euAiActCategory: null,
          isHighRisk: false,
          containsPii: false,
          dataSensitivity: null,
        },
      }),
    );

    expect(result.state).toBe("not_ready");
    expect(
      result.checks.find((check) => check.id === "classified"),
    ).toMatchObject({ status: "fail", severity: "blocking" });
  });

  it("requires an approved FRIA for high-risk systems", () => {
    const result = evaluateReadiness(
      baseSnapshot({
        classification: {
          present: true,
          euAiActCategory: "high",
          isHighRisk: true,
          containsPii: false,
          dataSensitivity: null,
        },
        fria: { approvedCount: 0 },
      }),
    );

    expect(result.checks.find((check) => check.id === "fria")).toMatchObject({
      status: "fail",
      severity: "blocking",
    });
    expect(result.state).toBe("not_ready");
  });

  it("treats FRIA as not applicable for non-high-risk systems", () => {
    const result = evaluateReadiness(
      baseSnapshot({ fria: { approvedCount: 0 } }),
    );

    expect(result.checks.find((check) => check.id === "fria")).toMatchObject({
      status: "na",
      severity: "advisory",
    });
    expect(result.state).toBe("ready");
  });

  it("keeps advisory gaps separate from blocking failures", () => {
    const result = evaluateReadiness(
      baseSnapshot({ documentation: { hasModelCard: false, versionCount: 0 } }),
    );

    expect(result.blockingFailing).toBe(0);
    expect(result.advisoryOpen).toBe(1);
    expect(result.state).toBe("conditionally_ready");
  });

  it("marks a live approval for re-review when it is stale", () => {
    const result = evaluateReadiness(
      baseSnapshot({
        goLive: {
          id: "g1",
          status: "approved",
          rationale: "",
          conditions: [],
          decidedById: "u1",
          decidedByName: "O",
          decidedAt: new Date(),
          boundTier: 0,
          boundModelRef: "v1",
          staleApproval: true,
        },
      }),
    );

    expect(result.state).toBe("needs_re_review");
  });
});
