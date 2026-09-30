import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import path from "node:path";

test.use({ storageState: storageStateFor("admin") });

test("evidence list page renders", async ({ page }) => {
  await page.goto("/zh/evidence");
  await page.waitForLoadState("domcontentloaded");
  // level 1 pins this to the page title. Without it the empty-state heading
  // ("暂无上传的证据材料。", an h2) also matches and the locator resolves to two
  // elements — a strict-mode violation on any org with no evidence uploaded,
  // which is every freshly seeded database.
  await expect(
    page.getByRole("heading", { level: 1, name: /Evidence|证据材料/ }),
  ).toBeVisible();
});

test("evidence upload and list flow", async ({ page }) => {
  await page.goto("/zh/evidence");
  await page.waitForLoadState("domcontentloaded");

  // Click the Upload button
  const uploadBtn = page.getByRole("button", {
    name: /Upload Evidence|上传证据/,
  });
  await uploadBtn.click();

  // Upload dialog should appear
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Upload a small test file
  const fileInput = dialog.locator('input[type="file"]');
  const testFile = path.resolve(__dirname, "helpers", "dummy-evidence.txt");
  await fileInput.setInputFiles(testFile);

  // Submit the upload
  const submitBtn = dialog.getByRole("button", { name: /Upload|上传/ }).last();
  await submitBtn.click();

  // Wait for upload response — dialog closes on success, stays open on error
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // Reload to get fresh server-side data
  await page.reload();
  await page.waitForLoadState("networkidle");

  // The uploaded file should appear in the table (use .first() for strict mode)
  await expect(page.getByText("dummy-evidence.txt").first()).toBeVisible({
    timeout: 10_000,
  });
});
