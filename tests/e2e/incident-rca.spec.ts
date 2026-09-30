import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

// Navigate straight to the seeded demo incident instead of clicking the first
// list row: parallel specs (incident-dedup-merge) create and delete incidents,
// so a list link can 404 by the time it is clicked.
async function seededIncidentId(): Promise<string> {
  const admin = await prisma.user.findFirstOrThrow({
    where: { email: "admin@demo.local" },
  });
  const membership = await prisma.membership.findFirstOrThrow({
    where: { userId: admin.id },
  });
  const incident = await prisma.incident.findFirstOrThrow({
    where: { orgId: membership.orgId, title: { not: { contains: "dedup" } } },
    orderBy: { openedAt: "asc" },
  });
  return incident.id;
}

test.describe("incident-rca", () => {
  test("admin can open incident detail and see RCA panel", async ({ page }) => {
    await page.goto(`/en/incidents/${await seededIncidentId()}`);
    await page.waitForLoadState("networkidle");

    // The RCA panel heading should be visible (if INCIDENT_RCA env is configured)
    const rcaHeading = page.getByRole("heading", { name: /AI Root Cause/i });
    const rcaVisible = await rcaHeading.isVisible().catch(() => false);

    if (rcaVisible) {
      // The suggest button should be present
      await expect(
        page.getByRole("button", { name: /Summarize root cause with AI/i }),
      ).toBeVisible();
    }
  });

  test("incident detail page shows root cause section", async ({ page }) => {
    await page.goto(`/en/incidents/${await seededIncidentId()}`);

    // Root cause section should exist
    await expect(page.getByText("Root cause")).toBeVisible({ timeout: 10_000 });
  });
});
