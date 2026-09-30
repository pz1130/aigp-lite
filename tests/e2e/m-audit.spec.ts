import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test("audit log page renders with table", async ({ page }) => {
  await page.goto("/zh/audit");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: /Audit Log|审计日志/ }),
  ).toBeVisible();

  // Should have a table with audit entries
  const table = page.locator("table");
  await expect(table).toBeVisible();
});

test("audit log shows entries from previous actions", async ({ page }) => {
  // First, create an audit trail by visiting another page
  await page.goto("/zh/policy");
  await page.waitForLoadState("domcontentloaded");

  // Now check audit log for the visit
  await page.goto("/zh/audit");
  await page.waitForLoadState("domcontentloaded");

  // The table should have at least one row (from our navigation or seed data)
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 5_000 });
});

test("audit export CSV link is present", async ({ page }) => {
  await page.goto("/zh/audit");
  await page.waitForLoadState("domcontentloaded");

  const exportBtn = page.getByRole("link", { name: /Export CSV|导出 CSV/ });
  await expect(exportBtn).toBeVisible();
  await expect(exportBtn).toHaveAttribute("href", /audit\/export/);
});
