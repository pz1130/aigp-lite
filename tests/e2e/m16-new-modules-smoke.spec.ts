import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { demoOrgAndAdmin } from "./helpers/demo";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

const E2E = "E2E-smoke";

/** UI create → score first item via 是 → verify persisted answer via prisma. */
async function checklistSmoke(opts: {
  page: import("@playwright/test").Page;
  route: string; // e.g. "mindforge-checklist"
  title: string;
  findAnswer: (assessmentId: string) => Promise<{ status: string } | null>;
}) {
  const { page, route, title, findAnswer } = opts;
  await page.goto(`/zh/${route}/new`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("标题").fill(title);
  await page.getByRole("button", { name: "创建", exact: true }).click();
  // Exclude trailing "new" — `/…/new` already matches bare [a-z0-9]+ and
  // would resolve before the create redirect, leaving assessmentId === "new".
  await page.waitForURL(new RegExp(`/${route}/(?!new(?:/|$))[a-z0-9]+$`, "i"), {
    timeout: 15_000,
  });
  const assessmentId = page.url().split("/").pop()!;

  await page.getByRole("button", { name: "是", exact: true }).first().click();
  await expect
    .poll(async () => (await findAnswer(assessmentId))?.status ?? null, {
      timeout: 10_000,
    })
    .toBe("yes");

  // Reload → detail still renders with the scored catalog.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: "是", exact: true }).first(),
  ).toBeVisible();
}

test.describe("M16 — v0.23.0 new-modules smoke", () => {
  test.beforeEach(async () => {
    // Scoped cleanup, answers/clusters cascade from their parents.
    await prisma.vendor.deleteMany({ where: { name: { startsWith: E2E } } });
    await prisma.mfChecklistAssessment.deleteMany({
      where: { title: { startsWith: E2E } },
    });
    await prisma.agChkAssessment.deleteMany({
      where: { title: { startsWith: E2E } },
    });
    await prisma.aivtfAssessment.deleteMany({
      where: { title: { startsWith: E2E } },
    });
    const trendIds = (
      await prisma.incidentTrendReport.findMany({
        where: { execSummary: { startsWith: E2E } },
        select: { id: true },
      })
    ).map((r) => r.id);
    await prisma.incidentTrendCluster.deleteMany({
      where: { reportId: { in: trendIds } },
    });
    await prisma.incidentTrendReport.deleteMany({
      where: { id: { in: trendIds } },
    });
    await prisma.frtAssessment.deleteMany({
      where: { title: { startsWith: E2E } },
    });
    await prisma.txrReport.deleteMany({
      where: { title: { startsWith: E2E } },
    });
  });

  test("vendors: create via UI → appears in list", async ({ page }) => {
    const name = `${E2E} 供应商 ${Date.now()}`;
    await page.goto("/zh/vendors/new");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("名称").fill(name);
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.waitForURL(/\/vendors\/(?!new(?:\/|$))[a-z0-9]+$/i, {
      timeout: 15_000,
    });

    await page.goto("/zh/vendors");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("mindforge-checklist: create → score item → persisted", async ({
    page,
  }) => {
    if (!(await prisma.mfChecklistItem.findFirst()))
      throw new Error(
        "[e2e] MindForge checklist catalog not seeded — run `npm run prisma:seed`",
      );
    await checklistSmoke({
      page,
      route: "mindforge-checklist",
      title: `${E2E} MF 评估 ${Date.now()}`,
      findAnswer: (assessmentId) =>
        prisma.mfChecklistAnswer.findFirst({
          where: { assessmentId, status: "yes" },
        }),
    });
  });

  test("agentic-governance: create → score item → persisted", async ({
    page,
  }) => {
    if (!(await prisma.agChkItem.findFirst()))
      throw new Error(
        "[e2e] Agentic governance catalog not seeded — run `npm run prisma:seed`",
      );
    await checklistSmoke({
      page,
      route: "agentic-governance",
      title: `${E2E} AG 评估 ${Date.now()}`,
      findAnswer: (assessmentId) =>
        prisma.agChkAnswer.findFirst({
          where: { assessmentId, status: "yes" },
        }),
    });
  });

  test("aivtf: create → score item → persisted", async ({ page }) => {
    if (!(await prisma.aivtfProcess.findFirst()))
      throw new Error(
        "[e2e] AIVTF process catalog not seeded — run `npm run prisma:seed`",
      );
    await checklistSmoke({
      page,
      route: "aivtf",
      title: `${E2E} AIVTF 评估 ${Date.now()}`,
      findAnswer: (assessmentId) =>
        prisma.aivtfAnswer.findFirst({
          where: { assessmentId, status: "yes" },
        }),
    });
  });

  test("incident-trends: seeded report renders in list + detail", async ({
    page,
  }) => {
    const { admin, orgId } = await demoOrgAndAdmin();
    const report = await prisma.incidentTrendReport.create({
      data: {
        orgId,
        version: 9901,
        status: "published",
        windowStart: new Date("2026-06-01T00:00:00Z"),
        windowEnd: new Date("2026-06-30T23:59:59Z"),
        // Valid TrendStats shape (src/lib/incident-trends/stats.ts).
        statsJson: {
          total: 7,
          byCategory: { security: 4, quality: 3 },
          bySeverity: { high: 2, medium: 5 },
          byStatus: { open: 3, resolved: 4 },
          topUsecases: [],
          frameworkRollup: {},
          clusteredCount: 6,
          longTailCount: 1,
        },
        execSummary: `${E2E} 事件趋势执行摘要`,
        incidentCount: 7,
        generatedById: admin.id,
        publishedAt: new Date(),
      },
    });

    await page.goto("/zh/incident-trends");
    await page.waitForLoadState("networkidle");
    const link = page.locator(`a[href*="${report.id}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(`${E2E} 事件趋势执行摘要`)).toBeVisible();
  });

  test("frontier-risk-tier: seeded assessment renders in list + detail", async ({
    page,
  }) => {
    if (!(await prisma.frtCategory.findFirst()))
      throw new Error(
        "[e2e] FRT category catalog not seeded — run `npm run prisma:seed`",
      );
    const { admin, orgId } = await demoOrgAndAdmin();
    const title = `${E2E} 前沿分级 ${Date.now()}`;
    const frt = await prisma.frtAssessment.create({
      data: { orgId, title, createdById: admin.id },
    });

    await page.goto("/zh/frontier-risk-tier");
    await page.waitForLoadState("networkidle");
    // The list row is labeled by the assessment title (ListClient renders it);
    // the detail page does not echo the title, so assert it here, then confirm
    // the detail loaded via a detail-only, id-scoped anchor (the PDF export).
    const link = page.getByRole("link", { name: title });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator(`a[href*="/api/frontier-risk-tier/${frt.id}/pdf"]`),
    ).toBeVisible();
  });

  test("transparency-report: seeded report renders in list + detail", async ({
    page,
  }) => {
    const { admin, orgId } = await demoOrgAndAdmin();
    const title = `${E2E} 透明度报告 ${Date.now()}`;
    const txr = await prisma.txrReport.create({
      data: {
        orgId,
        title,
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-06-30T23:59:59Z"),
        periodLabel: "2026 H1",
        createdById: admin.id,
      },
    });

    await page.goto("/zh/transparency-report");
    await page.waitForLoadState("networkidle");
    const link = page.locator(`a[href*="${txr.id}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(title).first()).toBeVisible();
  });
});
