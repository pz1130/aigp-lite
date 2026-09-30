import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test.describe("risk-copilot E2E", () => {
  test("admin sees AI Risk Suggestions panel on usecase detail page", async ({
    page,
  }) => {
    await page.goto("/en/inventory");
    await expect(
      page.getByRole("heading", { name: /AI Use Cases|Inventory/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Click the first usecase in the list
    const firstLink = page
      .locator("a[href*='/inventory/']:not([href$='/new'])")
      .first();
    await firstLink.click();
    await page.waitForURL("**/inventory/**");
    await page.waitForLoadState("networkidle");

    // The RiskCopilotPanel heading should be visible
    await expect(
      page.getByRole("heading", { name: /AI Risk Suggestions/i }),
    ).toBeVisible({ timeout: 10_000 });

    // The suggest button should be present
    const suggestBtn = page.getByRole("button", {
      name: /Suggest risks with AI|Re-run/i,
    });
    await expect(suggestBtn).toBeVisible();
  });

  test("viewer sees disabled suggest button", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: storageStateFor("viewer"),
    });
    const page = await ctx.newPage();

    await page.goto("/en/inventory");
    await page.waitForLoadState("networkidle");

    const firstLink = page
      .locator("a[href*='/inventory/']:not([href$='/new'])")
      .first();
    await firstLink.click();
    await page.waitForURL("**/inventory/**");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: /AI Risk Suggestions/i }),
    ).toBeVisible({ timeout: 10_000 });

    const suggestBtn = page.getByRole("button", {
      name: /Suggest risks with AI|Re-run/i,
    });
    await expect(suggestBtn).toBeDisabled();

    await ctx.close();
  });
});
