import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto/secrets";

test.use({ storageState: storageStateFor("admin") });

test.describe("M12 — redteam", () => {
  test.afterAll(async () => {
    await prisma.evaluation.deleteMany({
      where: { connection: { name: "demo-mock" } },
    });
    await prisma.$disconnect();
  });

  test("run jailbreak evaluation against demo-mock → see findings → see model card", async ({
    page,
  }) => {
    test.setTimeout(90_000); // SSE stream + 5 mock LLM calls + tRPC refetch can exceed the 30s default.
    // ---- Seed: ensure demo-mock provider connection exists ----
    const admin = await prisma.user.findFirst({
      where: { email: "admin@demo.local" },
    });
    if (!admin) throw new Error("[e2e] expected admin@demo.local to be seeded");
    const membership = await prisma.membership.findFirst({
      where: { userId: admin.id },
    });
    if (!membership)
      throw new Error("[e2e] expected admin membership to be seeded");
    const orgId = membership.orgId;

    let conn = await prisma.providerConnection.findFirst({
      where: { orgId, name: "demo-mock" },
    });
    const encryptedCreds = new Uint8Array(encryptJson({ apiKey: "mock-key" }));
    if (!conn) {
      conn = await prisma.providerConnection.create({
        data: {
          orgId,
          name: "demo-mock",
          providerType: "openai_compatible",
          baseUrl: "http://localhost:4010",
          credentialsEncrypted: encryptedCreds,
          config: {},
          createdBy: "e2e",
        },
      });
    } else {
      conn = await prisma.providerConnection.update({
        where: { id: conn.id },
        data: {
          providerType: "openai_compatible",
          baseUrl: "http://localhost:4010",
          credentialsEncrypted: encryptedCreds,
        },
      });
    }

    // ---- Seed: ensure at least one aiUsecase exists for model card generation ----
    let usecase = await prisma.aiUsecase.findFirst({ where: { orgId } });
    if (!usecase) {
      usecase = await prisma.aiUsecase.create({
        data: {
          orgId,
          name: "e2e-test-usecase",
          ownerId: admin.id,
          lifecycleStage: "production",
          autonomyLevel: "assistant",
          deploymentType: "built",
          description: "E2E test usecase for model card generation",
        },
      });
    }

    // ---- Step 1: Navigate to new run page ----
    await page.goto("/zh/redteam/runs/new");
    await page.waitForLoadState("networkidle");

    // Select provider connection — RunWizard uses Radix Select (role=combobox)
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "demo-mock" }).click();

    // Fill model name
    await page.locator("input[placeholder*='Model']").fill("mock-model");

    // Expand jailbreak category and select first 5 prompts
    await page
      .getByText(/jailbreak/i)
      .first()
      .click();
    const checkboxes = page.locator('input[type="checkbox"]');
    for (let i = 0; i < 5; i++) {
      await checkboxes.nth(i).check();
    }

    // Click start/run button — SSE stream populates the findings table live.
    await page.getByRole("button", { name: /start|开始/i }).click();
    await page.waitForURL(/\/redteam\/runs\/(?!new$)[^/]+$/, {
      timeout: 10_000,
    });
    // Wait for the page to finish hydrating and the SSE stream to deliver
    // all five findings. The page also re-runs the trpc query after `done`,
    // so completed runs land via either liveFindings or ev.findings.
    await expect(page.locator("tbody tr")).toHaveCount(5, { timeout: 60_000 });

    // ---- Step 2: Generate model card ----
    await page.goto("/zh/redteam/model-cards");
    await page.waitForLoadState("networkidle");

    // Usecase picker is a Radix Select (role=combobox)
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: usecase.name }).first().click();
    await page.getByRole("button", { name: /markdown/i }).click();

    // Verify markdown output contains "Model Card:" heading
    await expect(page.locator("pre")).toContainText("Model Card:", {
      timeout: 10_000,
    });
  });
});
