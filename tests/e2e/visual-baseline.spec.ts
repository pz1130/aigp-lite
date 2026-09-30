import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";

test.describe("M-frontend — visual baselines", () => {
  test.use({ storageState: storageStateFor("admin") });

  // Playwright names snapshots per platform (dashboard-darwin.png), and only the
  // macOS set is committed. On Linux there is no baseline to compare against, so
  // the first CI run would write one and pass, and every run after that would
  // compare Linux pixels — different font rasterisation, different scrollbars —
  // against a file no reviewer ever looked at. Regenerating on Linux instead
  // would just move the problem to the developers who work on macOS.
  // These three stay a local check: run `npx playwright test visual-baseline`
  // on macOS before a UI change, and `--update-snapshots` to re-bless.
  test.skip(
    process.platform !== "darwin",
    "Screenshot baselines are committed for macOS only",
  );

  test("dashboard home", async ({ page }) => {
    await page.goto("/zh/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("dashboard.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
  test("inventory list", async ({ page }) => {
    await page.goto("/zh/dashboard/inventory");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("inventory-list.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
  test("incident detail", async ({ page }) => {
    // Relies on the seeded demo incident from prisma/seed.ts.
    const admin = await prisma.user.findFirstOrThrow({
      where: { email: "admin@demo.local" },
    });
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: admin.id },
    });
    const incident = await prisma.incident.findFirstOrThrow({
      where: { orgId: membership.orgId },
    });
    await page.goto(`/zh/incidents/${incident.id}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveScreenshot("incident-detail.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});
