import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test("audit log page renders", async ({ page }) => {
  await page.goto("/zh/audit");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: "审计日志", exact: true }),
  ).toBeVisible();

  // Should have a table with audit entries
  const table = page.locator("table");
  await expect(table).toBeVisible();
});

test("audit export CSV link is present", async ({ page }) => {
  await page.goto("/zh/audit");
  await page.waitForLoadState("domcontentloaded");

  const exportBtn = page.getByRole("link", { name: /Export CSV|导出 CSV/ });
  await expect(exportBtn).toBeVisible();
  await expect(exportBtn).toHaveAttribute("href", /audit\/export/);
});
