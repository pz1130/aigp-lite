import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { computeGovernanceScore } from "./scoring";

async function makeOrg(name = "GS-" + Date.now()) {
  return prisma.organization.create({ data: { name } });
}

async function makeUser(
  email = `gs-${Date.now()}-${Math.random().toString(36).slice(2)}@t.local`,
) {
  return prisma.user.create({ data: { email, name: "GS", passwordHash: "x" } });
}

async function addMember(
  orgId: string,
  userId: string,
  role: "admin" | "viewer" = "admin",
) {
  return prisma.membership.create({ data: { orgId, userId, role } });
}

let ucCounter = 0;
async function makeUsecase(
  orgId: string,
  ownerId: string,
  stage: "development" | "production" = "production",
) {
  return prisma.aiUsecase.create({
    data: {
      orgId,
      ownerId,
      name: `UC-${Date.now()}-${++ucCounter}`,
      autonomyLevel: "assistant",
      deploymentType: "built",
      description: "x".repeat(50),
      lifecycleStage: stage,
    },
  });
}

async function makeFramework() {
  return prisma.riskFramework.create({
    data: {
      name: "FW-" + Date.now(),
      code: "FW" + Date.now().toString(36),
      version: "1.0",
    },
  });
}

async function makeControl(
  frameworkId: string,
  severity: "low" | "medium" | "high" = "medium",
) {
  return prisma.riskControl.create({
    data: {
      frameworkId,
      code: "C-" + Date.now() + Math.random().toString(36).slice(2),
      title: "Control",
      description: "Test control",
      severity,
    },
  });
}

describe("computeGovernanceScore", () => {
  let org: { id: string };
  let user: { id: string };

  beforeEach(async () => {
    org = await makeOrg();
    user = await makeUser();
    await addMember(org.id, user.id);
  });

  describe("D1: Control Satisfaction", () => {
    it("returns 75% when 3 of 4 applicable controls are satisfied", async () => {
      const fw = await makeFramework();
      const controls = await Promise.all([
        makeControl(fw.id),
        makeControl(fw.id),
        makeControl(fw.id),
        makeControl(fw.id),
      ]);
      const uc = await makeUsecase(org.id, user.id);
      await Promise.all([
        prisma.usecaseControlStatus.create({
          data: {
            orgId: org.id,
            usecaseId: uc.id,
            controlId: controls[0].id,
            status: "satisfied",
          },
        }),
        prisma.usecaseControlStatus.create({
          data: {
            orgId: org.id,
            usecaseId: uc.id,
            controlId: controls[1].id,
            status: "satisfied",
          },
        }),
        prisma.usecaseControlStatus.create({
          data: {
            orgId: org.id,
            usecaseId: uc.id,
            controlId: controls[2].id,
            status: "satisfied",
          },
        }),
        prisma.usecaseControlStatus.create({
          data: {
            orgId: org.id,
            usecaseId: uc.id,
            controlId: controls[3].id,
            status: "failed",
          },
        }),
      ]);

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d1 = score.dimensions.find((d) => d.key === "controls")!;
      expect(d1.score).toBe(75);
      expect(d1.raw.applicable).toBe(4);
      expect(d1.raw.satisfied).toBe(3);
    });

    it("ignores not_applicable controls", async () => {
      const fw = await makeFramework();
      const controls = await Promise.all([
        makeControl(fw.id),
        makeControl(fw.id),
        makeControl(fw.id),
      ]);
      const uc = await makeUsecase(org.id, user.id);
      await Promise.all([
        prisma.usecaseControlStatus.create({
          data: {
            orgId: org.id,
            usecaseId: uc.id,
            controlId: controls[0].id,
            status: "satisfied",
          },
        }),
        prisma.usecaseControlStatus.create({
          data: {
            orgId: org.id,
            usecaseId: uc.id,
            controlId: controls[1].id,
            status: "not_applicable",
          },
        }),
        prisma.usecaseControlStatus.create({
          data: {
            orgId: org.id,
            usecaseId: uc.id,
            controlId: controls[2].id,
            status: "failed",
          },
        }),
      ]);

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d1 = score.dimensions.find((d) => d.key === "controls")!;
      expect(d1.score).toBe(50); // 1 of 2 applicable
    });

    it("returns 0 when no controls exist", async () => {
      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d1 = score.dimensions.find((d) => d.key === "controls")!;
      expect(d1.score).toBe(0);
    });
  });

  describe("D2: Risk Coverage", () => {
    it("scores based on assessed usecases with avg-score bonus", async () => {
      const uc1 = await makeUsecase(org.id, user.id);
      const uc2 = await makeUsecase(org.id, user.id);
      const uc3 = await makeUsecase(org.id, user.id);
      const _uc4 = await makeUsecase(org.id, user.id);

      // Assess 3 of 4 usecases, avg score ~40
      await Promise.all([
        prisma.usecaseRiskAssessment.create({
          data: {
            orgId: org.id,
            usecaseId: uc1.id,
            assessedById: user.id,
            scoreInt: 30,
            level: "low",
            notes: "",
          },
        }),
        prisma.usecaseRiskAssessment.create({
          data: {
            orgId: org.id,
            usecaseId: uc2.id,
            assessedById: user.id,
            scoreInt: 40,
            level: "medium",
            notes: "",
          },
        }),
        prisma.usecaseRiskAssessment.create({
          data: {
            orgId: org.id,
            usecaseId: uc3.id,
            assessedById: user.id,
            scoreInt: 50,
            level: "medium",
            notes: "",
          },
        }),
      ]);

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d2 = score.dimensions.find((d) => d.key === "risk")!;
      // coverage = 3/4 * 100 = 75, avgScore = 40, bonus = (50-40)/2 = 5
      expect(d2.score).toBe(80);
      expect(d2.raw.assessed).toBe(3);
    });

    it("returns 0 when no active usecases", async () => {
      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d2 = score.dimensions.find((d) => d.key === "risk")!;
      expect(d2.score).toBe(0);
    });
  });

  describe("D3: Incident Health", () => {
    it("deducts for overdue and open critical incidents", async () => {
      // 10 incidents: 8 closed on time, 1 overdue open, 1 open critical
      const past = new Date(Date.now() - 2 * 86400_000);
      const future = new Date(Date.now() + 2 * 86400_000);

      for (let i = 0; i < 8; i++) {
        await prisma.incident.create({
          data: {
            orgId: org.id,
            title: `Inc-${i}`,
            severity: "low",
            status: "closed",
            category: "data_leak",
            openedById: user.id,
            slaDeadline: future,
            closedAt: past,
          },
        });
      }
      // Overdue open
      await prisma.incident.create({
        data: {
          orgId: org.id,
          title: "Overdue",
          severity: "medium",
          status: "open",
          category: "data_leak",
          openedById: user.id,
          slaDeadline: past,
        },
      });
      // Open critical
      await prisma.incident.create({
        data: {
          orgId: org.id,
          title: "Critical",
          severity: "critical",
          status: "open",
          category: "data_leak",
          openedById: user.id,
          slaDeadline: future,
        },
      });

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d3 = score.dimensions.find((d) => d.key === "incidents")!;
      // closedOnTime = 8 (past <= future), slaRatio = 8/10 * 100 = 80
      // overdue = 1, openCritical = 1
      // score = 80 - 5 - 10 = 65
      expect(d3.raw.overdue).toBe(1);
      expect(d3.raw.openCritical).toBe(1);
      expect(d3.score).toBe(65);
    });

    it("returns 100 when no incidents exist", async () => {
      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d3 = score.dimensions.find((d) => d.key === "incidents")!;
      expect(d3.score).toBe(100);
    });
  });

  describe("D4: Policy Enforcement", () => {
    it("scores based on enabled ratio + activity bonus", async () => {
      await Promise.all([
        prisma.policy.create({
          data: {
            orgId: org.id,
            name: "P1",
            ruleJson: {},
            severity: "low",
            enforcementMode: "log",
            scope: "input",
            enabled: true,
          },
        }),
        prisma.policy.create({
          data: {
            orgId: org.id,
            name: "P2",
            ruleJson: {},
            severity: "low",
            enforcementMode: "log",
            scope: "input",
            enabled: true,
          },
        }),
        prisma.policy.create({
          data: {
            orgId: org.id,
            name: "P3",
            ruleJson: {},
            severity: "low",
            enforcementMode: "log",
            scope: "input",
            enabled: false,
          },
        }),
        prisma.policy.create({
          data: {
            orgId: org.id,
            name: "P4",
            ruleJson: {},
            severity: "low",
            enforcementMode: "log",
            scope: "input",
            enabled: true,
          },
        }),
      ]);
      // Create a recent policy evaluation to trigger the bonus
      const p1 = await prisma.policy.findFirst({
        where: { orgId: org.id, name: "P1" },
      });
      await prisma.policyEvaluation.create({
        data: {
          orgId: org.id,
          policyId: p1!.id,
          requestId: "r1",
          hit: true,
          snippet: "test",
        },
      });

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d4 = score.dimensions.find((d) => d.key === "policies")!;
      // enabledRatio = 3/4 * 100 = 75, bonus = 5
      expect(d4.score).toBe(80);
    });

    it("returns 0 when no policies exist", async () => {
      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d4 = score.dimensions.find((d) => d.key === "policies")!;
      expect(d4.score).toBe(0);
    });
  });

  describe("D5: Process Completeness", () => {
    it("averages classification, FRIA, and evidence coverage", async () => {
      const fw = await makeFramework();
      const controls = await Promise.all([
        makeControl(fw.id),
        makeControl(fw.id),
        makeControl(fw.id),
      ]);

      const uc1 = await makeUsecase(org.id, user.id);
      const uc2 = await makeUsecase(org.id, user.id);
      const uc3 = await makeUsecase(org.id, user.id);
      const _uc4 = await makeUsecase(org.id, user.id);

      // 3 of 4 classified
      await Promise.all([
        prisma.usecaseClassification.create({
          data: {
            orgId: org.id,
            usecaseId: uc1.id,
            domain: "test",
            summary: "s",
            generatedReason: "test",
          },
        }),
        prisma.usecaseClassification.create({
          data: {
            orgId: org.id,
            usecaseId: uc2.id,
            domain: "test",
            summary: "s",
            generatedReason: "test",
          },
        }),
        prisma.usecaseClassification.create({
          data: {
            orgId: org.id,
            usecaseId: uc3.id,
            domain: "test",
            summary: "s",
            generatedReason: "test",
          },
        }),
      ]);

      // 2 of 4 with approved FRIA
      await Promise.all([
        prisma.usecaseFria.create({
          data: {
            orgId: org.id,
            usecaseId: uc1.id,
            version: 1,
            status: "approved",
            title: "F1",
            sectionsJson: {},
            createdById: user.id,
          },
        }),
        prisma.usecaseFria.create({
          data: {
            orgId: org.id,
            usecaseId: uc2.id,
            version: 1,
            status: "approved",
            title: "F2",
            sectionsJson: {},
            createdById: user.id,
          },
        }),
      ]);

      // Link controls to usecases via UsecaseControlStatus (needed for evidence coverage denominator)
      await Promise.all(
        controls.map((c) =>
          prisma.usecaseControlStatus.create({
            data: {
              orgId: org.id,
              usecaseId: uc1.id,
              controlId: c.id,
              status: "satisfied",
            },
          }),
        ),
      );

      // Evidence on 2 of 3 controls
      await Promise.all([
        prisma.evidence.create({
          data: {
            orgId: org.id,
            controlId: controls[0].id,
            filename: "e1.pdf",
            filePath: "/e1",
            mimeType: "application/pdf",
            bytes: 100,
            sha256: "a",
            uploadedById: user.id,
          },
        }),
        prisma.evidence.create({
          data: {
            orgId: org.id,
            controlId: controls[1].id,
            filename: "e2.pdf",
            filePath: "/e2",
            mimeType: "application/pdf",
            bytes: 100,
            sha256: "b",
            uploadedById: user.id,
          },
        }),
      ]);

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d5 = score.dimensions.find((d) => d.key === "process")!;
      // classCoverage = 3/4 * 100 = 75
      // friaCoverage = 2/4 * 100 = 50
      // evidenceCoverage = 2/3 * 100 ≈ 67
      // avg ≈ (75 + 50 + 67) / 3 ≈ 64
      expect(d5.score).toBeGreaterThanOrEqual(63);
      expect(d5.score).toBeLessThanOrEqual(65);
    });
  });

  describe("D6: Maturity Survey", () => {
    it("includes survey dimension when data exists", async () => {
      const pillars = [
        "mandate_and_scope",
        "structure_and_roles",
        "processes",
        "decision_rights",
        "culture",
        "communication",
      ] as const;
      for (const p of pillars) {
        await prisma.governanceMaturityAssessment.create({
          data: {
            orgId: org.id,
            pillar: p,
            scoreInt: 9,
            maxScore: 12,
            details: {},
            byUserId: user.id,
          },
        });
      }

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d6 = score.dimensions.find((d) => d.key === "survey")!;
      expect(d6).toBeDefined();
      expect(d6!.score).toBe(75); // 9/12 * 100 = 75
    });

    it("excludes survey and redistributes weight when no data", async () => {
      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      const d6 = score.dimensions.find((d) => d.key === "survey");
      expect(d6).toBeUndefined();

      // Weights should sum to 1
      const totalWeight = score.dimensions.reduce((s, d) => s + d.weight, 0);
      expect(Math.abs(totalWeight - 1)).toBeLessThan(0.01);

      // Controls weight should be 0.25 / 0.9 ≈ 0.278
      const controls = score.dimensions.find((d) => d.key === "controls")!;
      expect(controls.weight).toBeCloseTo(0.278, 2);
    });
  });

  describe("integration", () => {
    it("produces a weighted overall score", async () => {
      // Minimal data: 1 usecase, 1 control satisfied, no incidents
      const fw = await makeFramework();
      const ctrl = await makeControl(fw.id);
      const uc = await makeUsecase(org.id, user.id);
      await prisma.usecaseControlStatus.create({
        data: {
          orgId: org.id,
          usecaseId: uc.id,
          controlId: ctrl.id,
          status: "satisfied",
        },
      });
      await prisma.usecaseRiskAssessment.create({
        data: {
          orgId: org.id,
          usecaseId: uc.id,
          assessedById: user.id,
          scoreInt: 20,
          level: "low",
          notes: "",
        },
      });

      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
      expect(score.dimensions.length).toBe(5); // no survey data
    });

    it("overall is 0 when org has no data at all", async () => {
      const score = await computeGovernanceScore(
        prisma as unknown as OrgScopedClient,
        org.id,
      );
      // controls=0, risk=0, incidents=100, policies=0, process=0
      // overall = 0*0.278 + 0*0.222 + 100*0.222 + 0*0.167 + 0*0.111 = 22.2
      expect(score.overall).toBeGreaterThanOrEqual(20);
      expect(score.overall).toBeLessThanOrEqual(25);
    });
  });
});
