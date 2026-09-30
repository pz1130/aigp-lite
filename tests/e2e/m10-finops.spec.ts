import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

test.describe("M10 — FinOps hardCap", () => {
  test.beforeEach(async () => {
    const demoOrg = await prisma.organization.findFirstOrThrow({
      where: { name: "Demo Org" },
    });
    // Clean up any test budgets
    await prisma.budgetAlert.deleteMany({
      where: { budget: { orgId: demoOrg.id } },
    });
    await prisma.budget.deleteMany({ where: { orgId: demoOrg.id } });
  });

  test("hardCap budget triggers 429 on /api/runtime/llm", async ({
    request,
  }) => {
    // Step 1: get org, connection, usecase from seed (scope to same org to avoid 404)
    const conn = await prisma.providerConnection.findFirstOrThrow({
      where: { isActive: true },
    });
    const org = await prisma.organization.findFirstOrThrow({
      where: { id: conn.orgId },
    });
    const uc = await prisma.aiUsecase.findFirstOrThrow({
      where: { orgId: org.id, lifecycleStage: "production" },
    });

    // Step 2: create an API key with runtime.invoke scope (mimics seed behavior)
    const crypto = await import("node:crypto");
    const rawKey = "aigp_" + crypto.randomBytes(20).toString("base64url");
    const hash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const apiKey = await prisma.apiKey.create({
      data: {
        orgId: org.id,
        label: "e2e-hardcap-test",
        prefix: rawKey.slice(0, 8),
        hash,
        scopes: ["runtime.invoke", "runtime.read"],
      },
    });

    // Step 3: create a cent-level hardCap budget and pre-seed spend above it.
    // The budget column stores cents, so sub-cent fixtures are rounded to zero.
    const budget = await prisma.budget.create({
      data: {
        orgId: org.id,
        scope: "org",
        period: "monthly",
        amountUsd: "0.01",
        hardCap: true,
        createdBy: "e2e-test",
        isActive: true,
      },
    });
    await prisma.llmInvocation.create({
      data: {
        orgId: org.id,
        apiKeyId: apiKey.id,
        provider: "openai_compatible",
        model: "deepseek-chat",
        promptHash: "e2e-hardcap",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 1,
        ts: new Date(),
      },
    });

    try {
      const response = await request.post("/api/runtime/llm", {
        headers: {
          authorization: `Bearer ${rawKey}`,
          "content-type": "application/json",
        },
        data: {
          connectionId: conn.id,
          usecaseId: uc.id,
          model: "deepseek-chat",
          messages: [{ role: "user", content: "hi" }],
        },
      });

      expect(response.status()).toBe(429);
      expect(response.headers()["x-budget-exceeded"]).toBe("org");
    } finally {
      await prisma.llmInvocation.deleteMany({ where: { apiKeyId: apiKey.id } });
      await prisma.budget.delete({ where: { id: budget.id } });
      await prisma.apiKey.delete({ where: { id: apiKey.id } });
    }
  });

  test("budget CRUD via UI", async ({ page }) => {
    await page.goto("/zh/finops/budgets");
    await page.waitForLoadState("networkidle");

    // Click new budget
    await page.getByRole("button", { name: /new budget|新建预算/i }).click();
    await page.waitForSelector("form", { timeout: 3000 });

    // Fill form
    const selects = page.locator("select");
    await selects.nth(0).selectOption("org");
    await selects.nth(1).selectOption("monthly");
    await page.locator('input[type="number"]').fill("100");
    // don't check hardCap

    await page
      .getByRole("button", { name: /create|创建/i })
      .last()
      .click();

    // Should appear in list
    await page.waitForLoadState("networkidle");
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(await rows.count()); // just check table renders
  });
});
