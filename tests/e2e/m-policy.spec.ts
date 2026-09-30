import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";
import { demoOrgAndAdmin } from "./helpers/demo";

test.use({ storageState: storageStateFor("admin") });

// Policy has @@unique([orgId, name]); a leftover row from a previous run makes
// the re-create fail server-side and the form never redirects.
test.beforeEach(async () => {
  await prisma.policy.deleteMany({ where: { name: "E2E Test Policy" } });
});

test("policy list page renders", async ({ page }) => {
  await page.goto("/zh/policy");
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", { name: /Policies|策略/ }),
  ).toBeVisible();
});

test("policy CRUD: create a policy via form", async ({ page }) => {
  await page.goto("/zh/policy/new");
  await page.waitForLoadState("domcontentloaded");

  // Fill in the policy name (Input component — no name attr, use label)
  await page.getByLabel(/Name|名称/).fill("E2E Test Policy");

  // Fill in description
  await page.getByLabel(/Description|描述/).fill("Policy created by E2E test");

  // Fill in rule JSON — the textarea has no label association (the "规则 (JSON)"
  // text is a sibling, not a <label>), so target the last textbox on the form.
  await page
    .getByRole("textbox")
    .last()
    .fill('{"type":"block","pattern":"SSN"}');

  // Select severity via Radix Select (role=combobox)
  await page.getByRole("combobox", { name: /Severity|严重性/ }).click();
  await page.getByRole("option", { name: /High|高/ }).click();

  // Select enforcement mode (zh: block = 阻止)
  await page.getByRole("combobox", { name: /Mode|模式/ }).click();
  await page.getByRole("option", { name: /Block|阻止/ }).click();

  // Select scope (zh label = 作用域)
  await page.getByRole("combobox", { name: /Scope|作用域/ }).click();
  await page.getByRole("option", { name: /Both|双向/ }).click();

  // Submit the form
  await page.getByRole("button", { name: /Save|保存/ }).click();

  // Should redirect back to policy list
  await page.waitForURL("**/policy", { timeout: 10_000 });

  // The new policy should appear in the list
  await expect(page.getByText("E2E Test Policy")).toBeVisible({
    timeout: 5_000,
  });
});

test("policy list shows existing policies with columns", async ({ page }) => {
  // The table only renders when the org owns at least one policy — an empty
  // org shows "暂无策略。" and no columnheaders at all. The create test above
  // leaves one behind, but `beforeEach` deletes it again, and a freshly seeded
  // database (every CI run) has none. Own the precondition here.
  const { orgId } = await demoOrgAndAdmin();
  await prisma.policy.upsert({
    where: { orgId_name: { orgId, name: "E2E Columns Fixture" } },
    update: {},
    create: {
      orgId,
      name: "E2E Columns Fixture",
      description: "Guarantees the policy table has a row to render.",
      ruleJson: { type: "block", pattern: "SSN" },
      severity: "high",
      enforcementMode: "block",
      scope: "both",
    },
  });

  await page.goto("/zh/policy");
  await page.waitForLoadState("domcontentloaded");

  // Should show column headers
  await expect(
    page.getByRole("columnheader", { name: /Name|名称/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /Severity|严重/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /Mode|模式/ }),
  ).toBeVisible();
});
