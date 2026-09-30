import { describe, it, expect } from "vitest";
import { evaluateReadiness } from "@/lib/dossier/readiness";
import type { DossierSnapshot } from "@/lib/dossier/types";

function baseSnapshot(over: Partial<DossierSnapshot> = {}): DossierSnapshot {
  const s: DossierSnapshot = {
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
  return { ...s, ...over } as DossierSnapshot;
}

describe("evaluateReadiness", () => {
  it("returns exactly 15 checks", () => {
    expect(evaluateReadiness(baseSnapshot()).checks).toHaveLength(15);
  });

  it("a fully-satisfied minimal-risk system is ready", () => {
    const r = evaluateReadiness(baseSnapshot());
    expect(r.state).toBe("ready");
    expect(r.blockingFailing).toBe(0);
    expect(r.advisoryOpen).toBe(0);
  });

  it("unclassified system is not_ready (blocking fail)", () => {
    const r = evaluateReadiness(
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
    expect(r.state).toBe("not_ready");
    const classified = r.checks.find((c) => c.id === "classified")!;
    expect(classified.status).toBe("fail");
    expect(classified.severity).toBe("blocking");
  });

  it("missing FRIA is blocking for high-risk but advisory for minimal", () => {
    const high = evaluateReadiness(
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
    const friaHigh = high.checks.find((c) => c.id === "fria")!;
    expect(friaHigh.severity).toBe("blocking");
    expect(friaHigh.status).toBe("fail");
    expect(high.state).toBe("not_ready");

    const minimal = evaluateReadiness(
      baseSnapshot({ fria: { approvedCount: 0 } }),
    );
    const friaMin = minimal.checks.find((c) => c.id === "fria")!;
    expect(friaMin.severity).toBe("advisory");
    expect(friaMin.status).toBe("warn");
    expect(minimal.state).toBe("conditionally_ready");
  });

  it("open high/critical incident blocks go-live", () => {
    const r = evaluateReadiness(
      baseSnapshot({ incidents: { openHighOrCritical: 1 } }),
    );
    expect(r.checks.find((c) => c.id === "incidents")!.status).toBe("fail");
    expect(r.state).toBe("not_ready");
  });

  it("advisory gaps yield conditionally_ready, not not_ready", () => {
    const r = evaluateReadiness(
      baseSnapshot({ logging: { invocationCount: 0 } }),
    );
    expect(r.blockingFailing).toBe(0);
    expect(r.advisoryOpen).toBe(1);
    expect(r.state).toBe("conditionally_ready");
  });

  it("PII makes data_governance blocking and requires sensitivity", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        classification: {
          present: true,
          euAiActCategory: "limited",
          isHighRisk: false,
          containsPii: true,
          dataSensitivity: null,
        },
      }),
    );
    const dg = r.checks.find((c) => c.id === "data_governance")!;
    expect(dg.severity).toBe("blocking");
    expect(dg.status).toBe("fail");
  });

  it("state is live when goLive status is live, regardless of gaps", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        logging: { invocationCount: 0 },
        goLive: {
          id: "g1",
          status: "live",
          rationale: "",
          conditions: [],
          decidedById: "u1",
          decidedByName: "O",
          decidedAt: new Date(),
          boundTier: 0,
          boundModelRef: "v1",
          staleApproval: false,
        },
      }),
    );
    expect(r.state).toBe("live");
  });

  it("external red-team is blocking for high-risk, advisory for minimal", () => {
    const high = evaluateReadiness(
      baseSnapshot({
        classification: {
          present: true,
          euAiActCategory: "high",
          isHighRisk: true,
          containsPii: false,
          dataSensitivity: null,
        },
        externalRedteam: { attestationCount: 0 },
      }),
    );
    const ext = high.checks.find((c) => c.id === "external_redteam")!;
    expect(ext.severity).toBe("blocking");
    expect(ext.status).toBe("fail");
    expect(high.state).toBe("not_ready");

    const minimal = evaluateReadiness(
      baseSnapshot({ externalRedteam: { attestationCount: 0 } }),
    );
    const extMin = minimal.checks.find((c) => c.id === "external_redteam")!;
    expect(extMin.severity).toBe("advisory");
    expect(extMin.status).toBe("warn");
  });

  it("an external attestation satisfies the external_redteam check", () => {
    const r = evaluateReadiness(
      baseSnapshot({ externalRedteam: { attestationCount: 2 } }),
    );
    expect(r.checks.find((c) => c.id === "external_redteam")!.status).toBe(
      "pass",
    );
  });

  it("tier 2 elevates redteam and fria to blocking; gaps yield not_ready", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        capability: { assessed: true, effectiveTier: 2 },
        fria: { approvedCount: 0 },
        redteam: { completedCount: 0 },
        externalRedteam: { attestationCount: 0 },
      }),
    );
    const fria = r.checks.find((c) => c.id === "fria")!;
    const redteam = r.checks.find((c) => c.id === "redteam")!;
    expect(fria.severity).toBe("blocking");
    expect(fria.status).toBe("fail");
    expect(redteam.severity).toBe("blocking");
    expect(redteam.status).toBe("fail");
    expect(fria.metric.requiredAtTier).toBe(2);
    expect(r.state).toBe("not_ready");
  });

  it("unassessed high-risk fails capability_tier_assessed and blocks go-live", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        capability: { assessed: false, effectiveTier: null },
        classification: {
          present: true,
          euAiActCategory: "high",
          isHighRisk: true,
          containsPii: false,
          dataSensitivity: null,
        },
      }),
    );
    const cap = r.checks.find((c) => c.id === "capability_tier_assessed")!;
    expect(cap.severity).toBe("blocking");
    expect(cap.status).toBe("fail");
    expect(r.state).toBe("not_ready");
  });

  it("unassessed minimal-risk yields capability_tier_assessed warn only", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        capability: { assessed: false, effectiveTier: null },
      }),
    );
    const cap = r.checks.find((c) => c.id === "capability_tier_assessed")!;
    expect(cap.severity).toBe("advisory");
    expect(cap.status).toBe("warn");
    expect(r.state).toBe("conditionally_ready");
  });

  it("does not lower checks already blocking via isHighRisk when tier is low", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        capability: { assessed: true, effectiveTier: 0 },
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
    const fria = r.checks.find((c) => c.id === "fria")!;
    expect(fria.severity).toBe("blocking");
    expect(fria.status).toBe("fail");
    expect(fria.metric.requiredAtTier).toBeUndefined();
  });

  it("fingerprint drift on a live approval yields needs_re_review", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        goLive: {
          id: "g1",
          status: "live",
          rationale: "",
          conditions: [],
          decidedById: "u1",
          decidedByName: "O",
          decidedAt: new Date(),
          boundTier: 1,
          boundModelRef: "v1",
          staleApproval: false,
        },
        capability: { assessed: true, effectiveTier: 2 },
        modelRef: "v1",
      }),
    );
    expect(r.state).toBe("needs_re_review");
  });

  it("staleApproval flag yields needs_re_review even when fingerprint matches", () => {
    const r = evaluateReadiness(
      baseSnapshot({
        goLive: {
          id: "g1",
          status: "approved",
          rationale: "",
          conditions: [],
          decidedById: "u1",
          decidedByName: "O",
          decidedAt: new Date(),
          boundTier: 1,
          boundModelRef: "v1",
          staleApproval: true,
        },
        capability: { assessed: true, effectiveTier: 1 },
        modelRef: "v1",
      }),
    );
    expect(r.state).toBe("needs_re_review");
  });
});

function checkById(s: Parameters<typeof evaluateReadiness>[0], id: string) {
  return evaluateReadiness(s).checks.find((c) => c.id === id)!;
}

describe("alignment_audit readiness check", () => {
  it("fail blocks at every risk level", () => {
    const low = baseSnapshot({
      classification: {
        present: true,
        euAiActCategory: "limited",
        isHighRisk: false,
        containsPii: false,
        dataSensitivity: null,
      },
      alignmentAudit: { status: "fail" },
    });
    const c = checkById(low, "alignment_audit");
    expect(c.severity).toBe("blocking");
    expect(c.status).toBe("fail");
  });

  it("missing blocks high-risk, advisory otherwise", () => {
    const hi = baseSnapshot({
      classification: {
        present: true,
        euAiActCategory: "high",
        isHighRisk: true,
        containsPii: false,
        dataSensitivity: null,
      },
      alignmentAudit: { status: "missing" },
    });
    expect(checkById(hi, "alignment_audit").status).toBe("fail");
    const low = baseSnapshot({
      classification: {
        present: true,
        euAiActCategory: "limited",
        isHighRisk: false,
        containsPii: false,
        dataSensitivity: null,
      },
      alignmentAudit: { status: "missing" },
    });
    expect(checkById(low, "alignment_audit").status).toBe("warn");
  });

  it("stale behaves like missing", () => {
    const hi = baseSnapshot({
      classification: {
        present: true,
        euAiActCategory: "high",
        isHighRisk: true,
        containsPii: false,
        dataSensitivity: null,
      },
      alignmentAudit: { status: "stale" },
    });
    expect(checkById(hi, "alignment_audit").status).toBe("fail");
  });

  it("concerns is advisory even for high-risk", () => {
    const hi = baseSnapshot({
      classification: {
        present: true,
        euAiActCategory: "high",
        isHighRisk: true,
        containsPii: false,
        dataSensitivity: null,
      },
      alignmentAudit: { status: "concerns" },
    });
    expect(checkById(hi, "alignment_audit").severity).toBe("advisory");
    expect(checkById(hi, "alignment_audit").status).toBe("warn");
  });

  it("fresh pass satisfies", () => {
    const hi = baseSnapshot({
      classification: {
        present: true,
        euAiActCategory: "high",
        isHighRisk: true,
        containsPii: false,
        dataSensitivity: null,
      },
      alignmentAudit: { status: "pass" },
    });
    expect(checkById(hi, "alignment_audit").status).toBe("pass");
  });
});
