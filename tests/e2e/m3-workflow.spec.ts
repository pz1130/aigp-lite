import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test("workflow happy path — usecase promotion from development to production", async ({
  page,
}) => {
  // ── Step 1: create a usecase ───────────────────────────────────────────────
  await page.goto("/zh/inventory");
  await page.locator("a", { hasText: "+ 新建用例" }).first().click();
  await page.waitForURL("**/inventory/new");

  await page.fill('input[name="name"]', `E2E Test Usecase ${Date.now()}`);
  // The form uses Radix Select (role=combobox), not a native <select>.
  await page.getByRole("combobox", { name: "Agent 自主度" }).click();
  await page.getByRole("option", { name: "简单 Agent" }).click();
  await page.getByRole("combobox", { name: "部署类型" }).click();
  await page.getByRole("option", { name: "自建" }).click();
  await page.fill('textarea[name="description"]', "Playwright test usecase");

  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(
    () =>
      /\/inventory\/[a-zA-Z0-9-]+$/.test(window.location.href) &&
      !window.location.href.endsWith("/inventory/new"),
    { timeout: 10_000 },
  );

  const usecaseName = (await page.locator("h1").first().innerText()).trim();

  // ── Step 2: the promotion workflow is auto-started on usecase.created ──────
  // (event bus subscriber in src/lib/workflow/subscribers.ts). No manual start.
  await page.goto("/zh/workflow");
  await page.waitForLoadState("networkidle");

  await page.getByRole("link", { name: usecaseName }).first().click();
  await page.waitForURL(/\/workflow\/[a-zA-Z0-9-]+$/);

  // ── Step 3-5: approve all three workflow steps ─────────────────────────────
  // After each click the page does router.refresh(); wait for the approved
  // count to bump before clicking again so we don't race the next render.
  for (let i = 1; i <= 3; i++) {
    await page.getByRole("button", { name: /批准|approve/i }).click();
    await expect(page.getByText("已批准")).toHaveCount(i, { timeout: 10_000 });
  }

  await expect(page.getByRole("button", { name: /批准|approve/i })).toHaveCount(
    0,
    { timeout: 5_000 },
  );
});
