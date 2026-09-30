import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SystemCardData } from "@/lib/system-card/aggregator";
import * as systemCard from "@/lib/system-card/aggregator";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { buildTrustPayloads, stripOpenIncidents } from "./aggregate";

/** A card populated with every sensitive field the tier split must contain. */
function sensitiveCard(): SystemCardData {
  return {
    snapshot: {
      system: {
        id: "uc1",
        name: "Claims Triage",
        ownerId: "u1",
        ownerName: "Owner",
        lifecycleStage: "production",
        autonomyLevel: "assisted",
        deploymentType: "internal",
        description: "d",
        modelCardMd: "m",
        intendedUseMd: "Triage inbound claims.\nSecond line of detail.",
        prohibitedUseMd: "p",
        humanOversightAttested: true,
        humanOversightAttestedByName: "Owner",
        humanOversightAttestedAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-02-01"),
        sunsetDate: null,
        deprecatedAt: null,
        deprecatedByName: null,
        deprecationReason: "",
      },
      classification: {
        present: true,
        euAiActCategory: "high_risk",
        isHighRisk: true,
        containsPii: true,
        dataSensitivity: "confidential",
      },
      risk: { hasAssessment: true, controlsNotSatisfied: 3 },
      regulatoryRisks: { total: 10, withoutRationale: 2 },
      dataGovernance: { dataSourceCount: 4 },
      documentation: { hasModelCard: true, versionCount: 2 },
      logging: { invocationCount: 100 },
      fria: { approvedCount: 1 },
      transparency: { publishedCount: 1 },
      redteam: { completedCount: 2 },
      externalRedteam: { attestationCount: 1 },
      drift: { benchmarkCount: 1, completedRunCount: 3 },
      alignmentAudit: { status: "concerns" },
      incidents: { openHighOrCritical: 2 },
      capability: { assessed: true, effectiveTier: 2 },
      modelRef: "claude-opus-5",
      goLive: {
        id: "gl1",
        status: "approved",
        rationale: "r",
        conditions: [],
        decidedById: "u1",
        decidedByName: "Owner",
        decidedAt: new Date("2026-03-01"),
        boundTier: 2,
        boundModelRef: "claude-opus-5",
        staleApproval: false,
      },
    },
    readiness: {
      checks: [
        {
          id: "external_redteam",
          status: "fail",
          severity: "blocking",
          articleRefs: ["Art.15"],
          deepLink: "/dossier/uc1",
          metric: { attestationCount: 0 },
        },
      ],
      state: "not_ready",
      blockingFailing: 1,
      advisoryOpen: 0,
    },
    latestAssessment: {
      level: "high",
      scoreInt: 71,
      assessedAt: new Date("2026-02-01"),
      notes: "n",
    },
    evaluations: [
      {
        id: "e1",
        createdAt: new Date("2026-02-02"),
        model: "claude-opus-5",
        totalPrompts: 40,
        passedCount: 33,
        failedCount: 6,
        errorCount: 1,
      },
    ],
    externalAttestations: [
      {
        id: "att1",
        attesterName: "Trail of Bits",
        attesterOrg: "Trail of Bits Inc",
        scope: "full system",
        attestedAt: new Date("2026-04-01"),
        engagementStart: new Date("2026-03-01"),
        engagementEnd: new Date("2026-03-20"),
        reportSha256: "a".repeat(64),
        summary: "s",
      },
    ],
    driftBenchmarks: [
      {
        id: "b1",
        name: "bench",
        threshold: 0.8,
        latestRun: {
          avgScore: 0.9,
          degraded: false,
          completedAt: new Date("2026-04-02"),
        },
      },
    ],
    friaRecords: [
      {
        id: "f1",
        title: "FRIA",
        version: 1,
        status: "approved",
        updatedAt: new Date("2026-04-03"),
      },
    ],
    transparencyReports: [
      {
        id: "t1",
        title: "H1 2026",
        version: 1,
        publishedAt: new Date("2026-04-04"),
      },
    ],
    openIncidents: [
      {
        id: "inc1",
        title: "Model leaked customer PII in claim summaries",
        severity: "critical",
        openedAt: new Date("2026-05-01"),
      },
    ],
    knownLimitations: "k",
    intendedUse: "Triage inbound claims.\nSecond line of detail.",
    prohibitedUse: "p",
    generatedAt: new Date("2026-05-02"),
    generatedBy: { id: "u1", name: "Owner" },
  };
}

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name:
        "TRUST-AGG-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}

describe("stripOpenIncidents", () => {
  it("removes the openIncidents key entirely", () => {
    const stripped = stripOpenIncidents(sensitiveCard());
    expect("openIncidents" in stripped).toBe(false);
  });
});

describe("buildTrustPayloads: the tier split", () => {
  beforeEach(() => {
    vi.spyOn(systemCard, "aggregateSystemCard").mockResolvedValue(
      sensitiveCard(),
    );
  });

  async function build() {
    const org = await makeOrg();
    const db = withOrg(prisma, org.id);
    return buildTrustPayloads({
      db,
      orgId: org.id,
      usecaseIds: ["uc1"],
      profile: {
        displayName: "Acme",
        intro: "We govern AI.",
        contactEmail: "trust@acme.example",
      },
      generatedBy: { id: "u1", name: "Owner" },
    });
  }

  // The whole-tree keyword search is deliberate: a field-by-field assertion
  // silently misses new keys as SystemCardData grows.
  const FORBIDDEN_IN_PUBLIC = [
    "openIncidents",
    "Model leaked customer PII",
    "attesterName",
    "Trail of Bits",
    "attesterContact",
    "reportSha256",
    "storageKey",
    "blockingFailing",
    "knownLimitations",
    "prohibitedUse",
  ];

  it("keeps every sensitive keyword out of the serialized public payload", async () => {
    const { publicPayload } = await build();
    const serialized = JSON.stringify(publicPayload);
    for (const needle of FORBIDDEN_IN_PUBLIC) {
      expect(serialized).not.toContain(needle);
    }
  });

  it("publishes evidence that governance happened, not its findings", async () => {
    const { publicPayload } = await build();
    expect(publicPayload.org.displayName).toBe("Acme");
    expect(publicPayload.systems).toEqual([
      {
        id: "uc1",
        name: "Claims Triage",
        intendedUse: "Triage inbound claims.",
        goLivePassed: true,
      },
    ]);
    expect(publicPayload.redteam).toEqual({
      attestationCount: 1,
      latestAttestationAt: "2026-04-01T00:00:00.000Z",
    });
    expect(publicPayload.transparencyReports[0]).toMatchObject({
      title: "H1 2026",
      version: 1,
    });
  });

  it("strips openIncidents from the CONFIDENTIAL payload too", async () => {
    const { confidentialPayload } = await build();
    const serialized = JSON.stringify(confidentialPayload);
    expect(serialized).not.toContain("openIncidents");
    expect(serialized).not.toContain("Model leaked customer PII");
  });

  it("gives the confidential tier the full card and failing checks", async () => {
    const { confidentialPayload } = await build();
    expect(
      confidentialPayload.systems[0].card.externalAttestations[0].attesterName,
    ).toBe("Trail of Bits");
    expect(confidentialPayload.readiness[0].checks[0]).toMatchObject({
      id: "external_redteam",
      status: "fail",
    });
  });
});
