import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test.describe("notifications", () => {
  test("/notifications page renders", async ({ page }) => {
    await page.goto("/zh/notifications");
    await expect(
      page.getByRole("heading", { name: /通知|Notifications/i }),
    ).toBeVisible();
    await expect(page.getByText(/暂无通知|No notifications/i)).toBeVisible();
  });

  test("bell icon is visible in topbar", async ({ page }) => {
    await page.goto("/zh/inventory");
    const bell = page
      .getByRole("button", { name: /通知|Notifications/i })
      .first();
    await expect(bell).toBeVisible();
  });
});
