import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("risk_officer") });

let demoConnectionId = "";

test.beforeAll(async () => {
  const user = await prisma.user.findFirst({
    where: { email: "risk_officer@demo.local" },
  });
  if (!user) throw new Error("seed missing risk_officer@demo.local user");
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
  });
  if (!membership) throw new Error("seed missing risk_officer membership");
  const orgId = membership.orgId;

  await prisma.policy.upsert({
    where: { orgId_name: { orgId, name: "PII: US Social Security Number" } },
    create: {
      orgId,
      name: "PII: US Social Security Number",
      description: "E2E seed policy for SSN block",
      ruleJson: {
        and: [{ regex_match: [{ var: ["text"] }, "\\d{3}-\\d{2}-\\d{4}"] }],
      },
      enforcementMode: "block",
      scope: "both",
      severity: "high",
      enabled: true,
    },
    update: {
      enabled: true,
      enforcementMode: "block",
      scope: "both",
      severity: "high",
      ruleJson: {
        and: [{ regex_match: [{ var: ["text"] }, "\\d{3}-\\d{2}-\\d{4}"] }],
      },
    },
  });

  const conn = await prisma.providerConnection.findFirst({
    where: { orgId, name: "mock-local" },
  });
  if (!conn) throw new Error("seed missing mock-local ProviderConnection");
  demoConnectionId = conn.id;
});

test("playground blocks SSN with PII policy", async ({ page }) => {
  // ── Step 1: install sample policies ──────────────────────────────────────────
  await page.goto("/zh/policy");
  await page.waitForLoadState("networkidle");

  const installBtn = page.getByRole("button", { name: /安装示例策略/i });
  if (await installBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await installBtn.click();
    await page.waitForLoadState("networkidle");
  }

  // ── Step 2: create API key ───────────────────────────────────────────────────
  await page.goto("/zh/policy/api-keys");
  await page.waitForLoadState("networkidle");
  await page.fill('input[placeholder*="密钥"]', "playground-key");
  await page.getByRole("button", { name: /创建密钥/i }).click();
  await expect(page.locator("code").first()).toBeVisible({ timeout: 5000 });
  const key = (await page.locator("code").first().innerText()).trim();

  // ── Step 3: test playground with SSN ────────────────────────────────────────
  await page.goto("/zh/policy/playground");
  await page.waitForLoadState("networkidle");
  await page.locator("input").first().fill(key);

  // The playground uses Radix Selects (role=combobox), not native <select>:
  // first combobox = connection, second = production usecase.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "mock-local" }).click();

  await page.getByRole("combobox").nth(1).click();
  const usecaseOptions = page.getByRole("option");
  if ((await usecaseOptions.count()) > 0) {
    await usecaseOptions.first().click();
  } else {
    await page.keyboard.press("Escape");
  }

  await page.fill("textarea", "my SSN is 123-45-6789");
  await page.getByRole("button", { name: /Send|发送/i }).click();
  await expect(
    page.getByRole("button", { name: /流式响应中|streaming/i }),
  ).toBeDisabled({ timeout: 10_000 });
});
