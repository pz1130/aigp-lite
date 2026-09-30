import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { demoOrgAndAdmin, demoUsecase } from "./helpers/demo";
import { prisma } from "@/lib/db";

const TITLE_PREFIX = "E2E-ext-report";

/** Enable public intake on the demo usecase; returns the fresh token. */
async function enablePublicIntake(): Promise<string> {
  const { orgId } = await demoOrgAndAdmin();
  const usecase = await demoUsecase(orgId);
  const token = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await prisma.aiUsecase.update({
    where: { id: usecase.id },
    data: { publicReportEnabled: true, publicReportToken: token },
  });
  return token;
}

async function cleanupReports() {
  const stale = await prisma.externalReport.findMany({
    where: { title: { startsWith: TITLE_PREFIX } },
    select: { escalatedIncidentId: true },
  });
  const incidentIds = stale
    .map((r) => r.escalatedIncidentId)
    .filter((x): x is string => x !== null);
  await prisma.externalReport.deleteMany({
    where: { title: { startsWith: TITLE_PREFIX } },
  });
  if (incidentIds.length > 0) {
    await prisma.incident.deleteMany({ where: { id: { in: incidentIds } } });
  }
}

test.describe("M13 — external reports: public intake (unauthenticated)", () => {
  // No session: fresh empty storage state instead of an admin cookie.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(cleanupReports);

  test("public submit → thanks confirmation → row persisted", async ({
    page,
  }) => {
    const token = await enablePublicIntake();
    const title = `${TITLE_PREFIX} 公共提交 ${Date.now()}`;

    await page.goto(`/zh/r/${token}`);
    await expect(
      page.getByRole("button", { name: /submit report|提交报告/i }),
    ).toBeVisible();

    await page.locator('input[name="title"]').fill(title);
    await page
      .locator('textarea[name="description"]')
      .fill("E2E 公共渠道提交的漏洞描述。");
    // Honeypot input[name="website"] stays untouched.
    // MIN_FILL_MS = 3000 dwell enforced server-side via HMAC renderedAt.
    await page.waitForTimeout(3500);
    await page.getByRole("button", { name: /submit report|提交报告/i }).click();

    await expect(page.getByText(/感谢您的报告|thank/i)).toBeVisible({
      timeout: 10_000,
    });
    const row = await prisma.externalReport.findFirst({ where: { title } });
    expect(row).toBeTruthy();
    expect(row?.status).toBe("received");
  });

  test("submitting before the 3s dwell is rejected, no row created", async ({
    page,
  }) => {
    const token = await enablePublicIntake();
    const title = `${TITLE_PREFIX} 秒提交 ${Date.now()}`;

    await page.goto(`/zh/r/${token}`);
    await page.locator('input[name="title"]').fill(title);
    await page.locator('textarea[name="description"]').fill("too fast");
    // Submit immediately — well under MIN_FILL_MS.
    await page.getByRole("button", { name: /submit report|提交报告/i }).click();

    // Anti-abuse returns silent HTTP 200 (same thanks UX as a real accept)
    // so bots are not tipped off — assert no row was persisted.
    await expect(page.getByText(/感谢您的报告|thank/i)).toBeVisible({
      timeout: 10_000,
    });
    const row = await prisma.externalReport.findFirst({ where: { title } });
    expect(row).toBeNull();
  });

  test("invalid token renders no intake form", async ({ page }) => {
    await page.goto(`/zh/r/e2e-invalid-token-${Date.now()}`);
    await expect(
      page.getByRole("button", { name: /submit report|提交报告/i }),
    ).toHaveCount(0);
  });
});

test.describe("M13 — external reports: triage + escalate (admin)", () => {
  test.use({ storageState: storageStateFor("admin") });

  test.beforeEach(cleanupReports);

  test("queue lists report → start triage → escalate creates incident", async ({
    page,
  }) => {
    const { orgId } = await demoOrgAndAdmin();
    const usecase = await demoUsecase(orgId);
    const title = `${TITLE_PREFIX} 分诊 ${Date.now()}`;
    const report = await prisma.externalReport.create({
      data: {
        orgId,
        usecaseId: usecase.id,
        type: "vulnerability",
        title,
        description: "E2E seeded report for the triage flow.",
      },
    });

    await page.goto("/zh/external-reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await page.getByRole("link", { name: title }).click();

    // received → triaging
    await page.getByRole("button", { name: /start triage|开始分诊/i }).click();
    await expect(page.getByText(/分诊中|triaging/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // escalate → incident created + button disappears
    await page.getByRole("button", { name: /escalate|升级为事件/i }).click();
    await expect
      .poll(
        async () => {
          const r = await prisma.externalReport.findUnique({
            where: { id: report.id },
          });
          return r?.escalatedIncidentId ?? null;
        },
        { timeout: 10_000 },
      )
      .not.toBeNull();
    await expect(
      page.getByRole("button", { name: /escalate|升级为事件/i }),
    ).toHaveCount(0, { timeout: 10_000 });

    const escalated = await prisma.externalReport.findUnique({
      where: { id: report.id },
    });
    const incident = await prisma.incident.findUnique({
      where: { id: escalated!.escalatedIncidentId! },
    });
    expect(incident).toBeTruthy();
  });
});
