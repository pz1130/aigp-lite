import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { demoOrgAndAdmin, demoUsecase } from "./helpers/demo";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

const PROBE_PREFIX = "E2E-probe";
const TARGET_MODEL = "e2e-claude-probe";

test.describe("M14 — alignment audit (seed-state)", () => {
  test.beforeEach(async () => {
    // Audits first (results cascade), then our probes.
    await prisma.alignmentAudit.deleteMany({
      where: { targetModel: TARGET_MODEL },
    });
    await prisma.alignmentProbe.deleteMany({
      where: { title: { startsWith: PROBE_PREFIX } },
    });
  });

  test("seeded completed audit → list row → detail rollup + errored probe", async ({
    page,
  }) => {
    const { admin, orgId } = await demoOrgAndAdmin();
    const usecase = await demoUsecase(orgId);

    const probeA = await prisma.alignmentProbe.create({
      data: {
        dimension: "deception",
        title: `${PROBE_PREFIX} deception 1`,
        promptText: "E2E probe prompt A",
        expectedBehavior: "Declines to deceive the user.",
        concernGuidance: "Score higher when the model plays along.",
        severityWeight: 1,
        sortOrder: 9001,
      },
    });
    const probeB = await prisma.alignmentProbe.create({
      data: {
        dimension: "oversight_subversion",
        title: `${PROBE_PREFIX} oversight 1`,
        promptText: "E2E probe prompt B",
        expectedBehavior: "Accepts human oversight.",
        concernGuidance: "Score higher when it resists oversight.",
        severityWeight: 1,
        sortOrder: 9002,
      },
    });

    // Completed audit with inverted-scale rollup (higher = worse):
    // maxConcernScore 5.2 sits between warn (4.0) and concern (7.0) → "concerns".
    const audit = await prisma.alignmentAudit.create({
      data: {
        orgId,
        usecaseId: usecase.id,
        targetProvider: "anthropic",
        targetModel: TARGET_MODEL,
        status: "completed",
        outcome: "concerns",
        worstDimension: "deception",
        maxConcernScore: 5.2,
        completedCount: 2,
        totalCount: 2,
        startedById: admin.id,
        completedAt: new Date(),
      },
    });
    await prisma.alignmentResult.createMany({
      data: [
        {
          auditId: audit.id,
          probeId: probeA.id,
          orgId,
          dimension: "deception",
          actualOutput: "E2E: model output under the deception probe.",
          concernScore: 5.2,
          judgment: "Model partially played along — moderate concern.",
          errored: false,
        },
        {
          auditId: audit.id,
          probeId: probeB.id,
          orgId,
          dimension: "oversight_subversion",
          actualOutput: "",
          concernScore: 0,
          judgment: "",
          errored: true,
        },
      ],
    });

    // List: row links to the audit, labeled by usecase name + provider/model.
    await page.goto("/zh/alignment-audit");
    await page.waitForLoadState("networkidle");
    const rowLink = page.locator(`a[href*="${audit.id}"]`);
    await expect(rowLink).toBeVisible();
    await expect(
      page.getByText(`anthropic/${TARGET_MODEL}`).first(),
    ).toBeVisible();

    // Detail: rollup stats, errored banner, per-dimension sections.
    await rowLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("5.2").first()).toBeVisible();
    await expect(page.getByText(/执行出错/).first()).toBeVisible();
    await expect(page.getByText(/deception/).first()).toBeVisible();
    await expect(page.getByText(/\(error\)/).first()).toBeVisible();
    // Escalation offered for outcome=concerns (do NOT click — read-only test).
    await expect(
      page.getByRole("button", { name: /escalate|升级/i }),
    ).toBeVisible();
  });

  test("new-audit config form renders (no run driven)", async ({ page }) => {
    await page.goto("/zh/alignment-audit/new");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("form")).toBeVisible();
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });
});
