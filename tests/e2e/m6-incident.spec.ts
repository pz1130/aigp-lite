import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test("incident list page renders without errors", async ({ page }) => {
  await page.goto("/zh/incidents");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", {
      name: /Security Incident|安全事件|Incidents/i,
    }),
  ).toBeVisible();
});

test("incident list page in English locale", async ({ page }) => {
  await page.goto("/en/incidents");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", {
      name: /Security Incident|安全事件|Incidents/i,
    }),
  ).toBeVisible();
});

test("open incidents widget shows count on dashboard", async ({ page }) => {
  await page.goto("/zh");
  await page.waitForLoadState("domcontentloaded");
  const widget = page.getByText(/Open incidents|待处理事件|Incidents/i);
  await expect(widget).toBeVisible();
});
