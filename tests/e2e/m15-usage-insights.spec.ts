import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { demoOrgAndAdmin } from "./helpers/demo";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

const SUMMARY_PREFIX = "E2E";
const THEME_PREFIX = "E2E-theme";
const LONGTAIL_LABEL = "E2E-longtail-hidden-theme";
const SERVER_NAME = "e2e-usage-insights-server";

async function cleanup() {
  const reports = await prisma.usageInsightReport.findMany({
    where: { execSummary: { startsWith: SUMMARY_PREFIX } },
    select: { id: true },
  });
  const ids = reports.map((r) => r.id);
  // FK order: clusters → reports.
  await prisma.usageInsightCluster.deleteMany({
    where: { reportId: { in: ids } },
  });
  await prisma.usageInsightReport.deleteMany({ where: { id: { in: ids } } });
  await prisma.mcpToolInvocation.deleteMany({
    where: { toolName: { startsWith: "e2e_" } },
  });
  await prisma.mcpServer.deleteMany({ where: { name: SERVER_NAME } });
}

test.describe("M15 — usage insights (seed-state)", () => {
  test.beforeEach(cleanup);
  test.afterAll(cleanup);

  test("draft + published render, k-anon suppression holds, publish supersedes, PDF downloads", async ({
    page,
  }) => {
    const { admin, orgId } = await demoOrgAndAdmin();

    // Consented MCP corpus (what generation would read; UI shows the reports).
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: SERVER_NAME,
        endpoint: "http://localhost:9999/mcp",
        transport: "http",
        createdById: admin.id,
      },
    });
    await prisma.mcpToolInvocation.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        orgId,
        serverId: server.id,
        toolName: `e2e_tool_${i % 2}`,
        actorId: admin.id,
        outcome: "success",
        consentGiven: true,
      })),
    });

    // Valid UsageStats shape — the detail client reads these fields directly.
    const stats = {
      total: 60,
      byTool: { e2e_tool_0: 40, e2e_tool_1: 20 },
      byOutcome: { success: 55, error: 5 },
      distinctActors: 12,
      clusteredCount: 52,
      longTailCount: 8,
    };

    const olderPublished = await prisma.usageInsightReport.create({
      data: {
        orgId,
        version: 9901,
        status: "published",
        windowStart: new Date("2026-06-01T00:00:00Z"),
        windowEnd: new Date("2026-06-30T23:59:59Z"),
        statsJson: stats,
        execSummary: "E2E 已发布的旧版报告",
        totalInvocations: 60,
        clusterCount: 3,
        suppressedClusterCount: 0,
        generatedById: admin.id,
        publishedAt: new Date("2026-07-01T00:00:00Z"),
      },
    });
    const draft = await prisma.usageInsightReport.create({
      data: {
        orgId,
        version: 9902,
        status: "draft",
        windowStart: new Date("2026-07-01T00:00:00Z"),
        windowEnd: new Date("2026-07-08T23:59:59Z"),
        statsJson: stats,
        execSummary: "E2E 草稿报告执行摘要",
        totalInvocations: 60,
        clusterCount: 4,
        suppressedClusterCount: 1, // triggers the kAnonNote
        generatedById: admin.id,
      },
    });
    await prisma.usageInsightCluster.createMany({
      data: [
        ...[0, 1, 2].map((i) => ({
          orgId,
          reportId: draft.id,
          themeLabel: `${THEME_PREFIX}-${i}`,
          narrative: `E2E 主题叙述 ${i}`,
          systemicObservation: "",
          confidence: "high",
          invocationCount: 15,
          distinctActorCount: 6, // ≥ k=5 → narrated
          topToolNames: ["e2e_tool_0"],
          outcomeBreakdown: { success: 15 },
          isLongTail: false,
        })),
        {
          orgId,
          reportId: draft.id,
          themeLabel: LONGTAIL_LABEL,
          narrative: "E2E long-tail narrative that must never render.",
          systemicObservation: "",
          confidence: "low",
          invocationCount: 3,
          distinctActorCount: 2, // < k=5 → aggregate-only
          topToolNames: [],
          outcomeBreakdown: { success: 3 },
          isLongTail: true,
        },
      ],
    });

    // List shows both versions.
    await page.goto("/zh/usage-insights");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`a[href*="${draft.id}"]`)).toBeVisible();
    await expect(page.locator(`a[href*="${olderPublished.id}"]`)).toBeVisible();

    // Draft detail: narrated clusters visible, long-tail suppressed, kAnonNote shown.
    await page.locator(`a[href*="${draft.id}"]`).click();
    await page.waitForLoadState("networkidle");
    for (const i of [0, 1, 2]) {
      await expect(page.getByText(`${THEME_PREFIX}-${i}`)).toBeVisible();
    }
    // k-anonymity surface invariant: suppressed theme never renders.
    await expect(page.getByText(LONGTAIL_LABEL)).toHaveCount(0);
    await expect(page.getByText(/已抑制/).first()).toBeVisible();

    // PDF export (m9 download pattern).
    const pdfLink = page.getByRole("link", { name: /导出 PDF|export pdf/i });
    await expect(pdfLink).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      pdfLink.click(),
    ]);
    expect(await download.path()).toBeTruthy();

    // Snapshot pre-existing published reports (not ours) so we can restore
    // them — publish supersedes every published report in the org.
    const preexisting = await prisma.usageInsightReport.findMany({
      where: {
        orgId,
        status: "published",
        NOT: { execSummary: { startsWith: SUMMARY_PREFIX } },
      },
      select: { id: true },
    });

    // Publish: draft → published, older E2E report → superseded.
    await page.getByRole("button", { name: /publish|发布/i }).click();
    await expect
      .poll(
        async () =>
          (
            await prisma.usageInsightReport.findUnique({
              where: { id: draft.id },
            })
          )?.status,
        { timeout: 10_000 },
      )
      .toBe("published");
    const superseded = await prisma.usageInsightReport.findUnique({
      where: { id: olderPublished.id },
    });
    expect(superseded?.status).toBe("superseded");
    // Publish button gone once no longer draft.
    await expect(
      page.getByRole("button", { name: /publish|发布/i }),
    ).toHaveCount(0, { timeout: 10_000 });

    // Restore any real published reports the transition superseded.
    if (preexisting.length > 0) {
      await prisma.usageInsightReport.updateMany({
        where: { id: { in: preexisting.map((r) => r.id) } },
        data: { status: "published" },
      });
    }
  });
});
