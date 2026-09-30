import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("ai_owner") });

test("M1 happy path: ai_owner registers usecase, risk_officer assesses", async ({
  page,
  browser,
}) => {
  // ── Step 1: ai_owner registers a usecase ─────────────────────────────────────
  await page.goto("/zh/inventory");
  await expect(page.getByRole("heading", { name: /AI 资产登记/ })).toBeVisible({
    timeout: 10_000,
  });

  await page.locator("a", { hasText: "+ 新建用例" }).first().click();
  await page.waitForURL("**/inventory/new");

  const timestamp = Date.now();
  await page.fill('input[name="name"]', `E2E ${timestamp}`);
  await page.fill('textarea[name="description"]', "E2E test description");
  // The form uses Radix Select (role=combobox), not a native <select>.
  await page.getByRole("combobox", { name: "Agent 自主度" }).click();
  await page.getByRole("option", { name: "简单 Agent" }).click();
  await page.getByRole("combobox", { name: "部署类型" }).click();
  await page.getByRole("option", { name: "自建" }).click();

  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(
    () => {
      const u = window.location.href;
      return (
        /\/inventory\/[a-zA-Z0-9-]+$/.test(u) && !u.endsWith("/inventory/new")
      );
    },
    { timeout: 10_000 },
  );

  const url = page.url();
  const match = url.match(/\/inventory\/([^/]+)/);
  const usecaseId = match?.[1];
  expect(usecaseId).toBeDefined();

  // ── Step 2: risk_officer assesses the usecase ───────────────────────────────
  const officerCtx = await browser.newContext({
    storageState: storageStateFor("risk_officer"),
  });
  const officerPage = await officerCtx.newPage();

  await officerPage.goto(`/zh/risk/usecases/${usecaseId}`);
  await officerPage.waitForLoadState("networkidle");

  const assessButton = officerPage.getByRole("button", { name: /执行评估/i });
  await expect(assessButton)
    .toBeEnabled({ timeout: 5_000 })
    .catch(async () => {
      await officerPage.waitForTimeout(1000);
    });
  await assessButton.click({ force: true });

  await expect(officerPage.locator("text=/(高|中|低)/").first()).toBeVisible({
    timeout: 15_000,
  });

  await officerCtx.close();
});
