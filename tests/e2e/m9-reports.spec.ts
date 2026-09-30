import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

test.describe("M9 — compliance reports", () => {
  test.beforeEach(async () => {
    await prisma.report.deleteMany({ where: { templateId: "nist-ai-rmf" } });
  });

  test("generate NIST report → PDF download → audit row appears", async ({
    page,
  }) => {
    // Navigate to reports page
    await page.goto("/zh/reports");
    await page.waitForLoadState("networkidle");

    // Click Generate Report
    await page
      .getByRole("button", { name: /generate report|生成报告/i })
      .click();

    // Wait for dialog
    await page.waitForSelector("form", { timeout: 5_000 });

    // Select NIST AI RMF template (should be default)
    const select = page.locator("select").first();
    await select.selectOption("nist-ai-rmf");

    // Submit
    await page
      .getByRole("button", { name: /generate report|生成报告/i })
      .last()
      .click();

    // Wait for report to appear in list (aggregation takes ~5s)
    await expect(page.getByText("nist-ai-rmf").first()).toBeVisible({
      timeout: 20_000,
    });

    // Verify PDF download link is present
    const pdfLink = page.getByRole("link", { name: /PDF/i }).first();
    await expect(pdfLink).toBeVisible();

    // Click PDF download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      pdfLink.click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();

    // Verify audit row
    await page.goto("/zh/audit");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("report.generate").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("reports list shows generated reports", async ({ page }) => {
    // Pre-seed a report — scope to the admin's org so the logged-in session sees it
    const user = await prisma.user.findFirstOrThrow({
      where: { email: "admin@demo.local" },
    });
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id },
    });
    await prisma.report.create({
      data: {
        orgId: membership.orgId,
        templateId: "iso-27001",
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-03-31"),
        generatedBy: user.id,
      },
    });

    await page.goto("/zh/reports");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("iso-27001").first()).toBeVisible();

    // Cleanup
    await prisma.report.deleteMany({
      where: { templateId: "iso-27001", generatedBy: user.id },
    });
  });
});
