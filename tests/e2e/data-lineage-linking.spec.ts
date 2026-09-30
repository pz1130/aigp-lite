import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";

// ai_owner has data_lineage: ["read", "write"] per src/lib/rbac/roles.ts
test.use({ storageState: storageStateFor("ai_owner") });

// A leftover link from an interrupted earlier run collides with the
// (usecaseId, dataSourceId, direction) unique key on re-create.
test.beforeEach(async () => {
  await prisma.usecaseDataLink.deleteMany({
    where: { purpose: "E2E added link" },
  });
});

test("data lineage: link a data source from Inventory detail, then unlink", async ({
  page,
}) => {
  // Navigate to the inventory list and find the demo usecase.
  await page.goto("/zh/inventory");
  await page
    .getByRole("link", { name: /demo-production-usecase/ })
    .first()
    .click();
  await page.waitForURL(/\/inventory\/[a-zA-Z0-9-]+$/);

  // The "数据源" section heading (h2) should be present, and the seeded link visible.
  await expect(page.getByRole("heading", { name: "数据源" })).toBeVisible({
    timeout: 10_000,
  });
  // .first(): the source name can render both in the linked-sources list and
  // elsewhere on the dossier page, which trips strict mode.
  await expect(page.getByText("Demo CRM Export").first()).toBeVisible({
    timeout: 5_000,
  });

  // Open the link dialog via the "+ 添加数据源" button.
  await page.getByRole("button", { name: /添加数据源/ }).click();

  // Search for the data source in the cmdk picker.
  await page.getByPlaceholder("搜索…").fill("Demo CRM");

  // cmdk Command.Item renders with role="option" and data-selected attribute.
  const option = page.getByRole("option", { name: /Demo CRM Export/ });
  await option
    .first()
    .click()
    .catch(async () => {
      // Fallback: cmdk-item div may not be reliably found by role; try text selector.
      await page
        .locator("[cmdk-item]", { hasText: "Demo CRM Export" })
        .first()
        .click();
    });

  // Select direction = inference_input; scope to the dialog to avoid matching the
  // section h3 of the same text that is visible behind the dialog overlay.
  const dialog = page.getByRole("dialog");
  await dialog.getByText("推理输入").click();

  // Fill the purpose field (maxLength=200 Input).
  await page.locator('input[maxlength="200"]').fill("E2E added link");

  // Submit the link dialog.
  await page.getByRole("button", { name: /^关联$/ }).click();

  // The "推理输入" sub-heading (h3) should appear and the purpose text be visible.
  await expect(page.locator("h3", { hasText: "推理输入" })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText("E2E added link")).toBeVisible();

  // Find the newly-created row by its purpose text and click its unlink button.
  const newRow = page.locator("li", { hasText: "E2E added link" });
  await newRow.getByRole("button", { name: /解除关联/ }).click();

  // The component confirms via an in-page ConfirmDialog (not window.confirm).
  const confirmDialog = page.getByRole("dialog", {
    name: "确认解除此关联？",
  });
  await confirmDialog.getByRole("button", { name: "解除关联" }).click();

  // The linked row with the purpose text should disappear.
  await expect(page.getByText("E2E added link")).toBeHidden({ timeout: 5_000 });
});
