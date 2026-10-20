import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { demoOrgAndAdmin } from "./helpers/demo";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

async function ensureUsecase() {
  const { admin, orgId } = await demoOrgAndAdmin();
  const existing = await prisma.aiUsecase.findFirst({ where: { orgId } });
  if (existing) return existing;
  return prisma.aiUsecase.create({
    data: {
      orgId,
      ownerId: admin.id,
      name: `e2e-trust-usecase-${Date.now()}`,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
}

// The first release covers public publication. Confidential dossier links are
// deliberately outside the Core scope.
// Run locally with `npm run prisma:seed && npm run e2e --
// tests/e2e/trust-center.spec.ts`.
// Admin chrome is next-intl on /zh/trust-center — use zh placeholders/labels.
test("trust center: publish and expose public profile", async ({ page }) => {
  test.setTimeout(90_000);
  await ensureUsecase();
  const slug = "e2e-" + Date.now().toString(36);

  await page.goto("/zh/trust-center");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "公开资料" })).toBeVisible({
    timeout: 20_000,
  });

  const slugInput = page.getByPlaceholder("URL 标识");
  const nameInput = page.getByPlaceholder("显示名称");
  // Profile hydration can overwrite an early fill; retry until values stick.
  await expect(async () => {
    await slugInput.fill(slug);
    await nameInput.fill("E2E Corp");
    expect(await slugInput.inputValue()).toBe(slug);
    expect(await nameInput.inputValue()).toBe("E2E Corp");
  }).toPass({ timeout: 15_000 });

  const live = page.getByRole("switch");
  await expect(async () => {
    if (!(await live.isChecked())) await live.click();
    expect(await live.isChecked()).toBe(true);
  }).toPass();

  const saved = page.waitForResponse(
    (r) => r.url().includes("trustCenter.saveProfile") && r.ok(),
  );
  await page.getByRole("button", { name: "保存资料" }).click();
  await saved;

  const box = page.getByRole("checkbox").first();
  await expect(box).toBeVisible({ timeout: 15_000 });
  await box.check();

  const drafted = page.waitForResponse(
    (r) => r.url().includes("trustCenter.createDraft") && r.ok(),
  );
  await page.getByRole("button", { name: "创建草稿" }).click();
  await drafted;

  const published = page.waitForResponse(
    (r) => r.url().includes("trustCenter.publish") && r.ok(),
  );
  await page.getByRole("button", { name: "发布", exact: true }).first().click();
  await published;
  await expect(page.getByText("published").first()).toBeVisible();

  // Public profile is visible to an anonymous visitor.
  const anon = await page.context().browser()!.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`/zh/trust/${slug}`);
  await expect(anonPage.getByText("E2E Corp")).toBeVisible();

  await anon.close();
});
