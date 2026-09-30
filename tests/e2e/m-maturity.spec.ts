import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test("maturity radar page renders", async ({ page }) => {
  await page.goto("/zh/maturity");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: /治理成熟度|Maturity/i }).first(),
  ).toBeVisible();
});

test("maturity assessment wizard: complete all 6 pillars and submit", async ({
  page,
}) => {
  await page.goto("/zh/maturity/new");
  await page.waitForLoadState("domcontentloaded");

  // Should see the wizard with 6 pillar steps
  await expect(page.getByText("mandate_and_scope")).toBeVisible();

  // Complete all 6 pillars
  for (let i = 0; i < 6; i++) {
    // Select a score (2) for each of the 4 questions in the current pillar
    const selects = page.locator('[role="combobox"]');
    const count = await selects.count();
    for (let q = 0; q < count; q++) {
      await selects.nth(q).click();
      await page.getByRole("option", { name: /^2 —/ }).click();
    }

    // Click Next (or submit on last step). zh label is 下一步; avoid /Next/
    // unanchored — it matches the "Open Next.js Dev Tools" overlay button.
    const nextBtn = page.getByRole("button", { name: /下一步|^Next/ });
    await nextBtn.click();

    // Wait for wizard to advance (or submit on last step)
    if (i < 5) {
      await page.waitForTimeout(200);
    }
  }

  // After submission, should redirect back to maturity radar
  await page.waitForURL("**/maturity", { timeout: 10_000 });
  await expect(
    page.getByRole("heading", { name: /治理成熟度|Maturity/i }).first(),
  ).toBeVisible();
});
