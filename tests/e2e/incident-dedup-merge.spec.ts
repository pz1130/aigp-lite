import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";
import { prisma } from "@/lib/db";

test.use({ storageState: storageStateFor("admin") });

// Poll the database for a merge suggestion until it appears (or timeout).
// The mock-openai server handles /v1/embeddings: "Auth bypass" → [1,0,0],
// other → [0,1,0]; cosine similarity between matching "Auth bypass" titles
// is 1.0, well above the default 0.85 dedup threshold.
function waitForMergeSuggestion(
  incidentId: string,
  timeout = 10_000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeout;
  const poll = (): Promise<Record<string, unknown> | null> =>
    new Promise((resolve) => {
      if (Date.now() >= deadline) return resolve(null);
      prisma.incidentMergeSuggestion
        .findFirst({
          where: { incidentId, dismissedAt: null, acceptedAt: null },
        })
        .then((s) => {
          if (s) resolve(s as Record<string, unknown>);
          else setTimeout(() => poll().then(resolve), 500);
        });
    });
  return poll();
}

test.describe("incident dedup + merge flow", () => {
  test.beforeEach(async () => {
    // Prune any incidents left from a previous run (sync call in beforeEach)
    await prisma.incidentMergeSuggestion.deleteMany({});
    await prisma.incident.deleteMany({
      where: { title: { contains: "e2e-dedup-test" } },
    });
  });

  test("two near-duplicate incidents → merge banner → merge collapses to one row", async ({
    page,
  }) => {
    // Create the first incident (no dedup possible since it's the only one)
    const res1 = await page.request.fetch(
      "http://localhost:3001/api/trpc/incident.create",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        data: {
          json: {
            title: "e2e-dedup-test: Auth bypass on chatbot-v2",
            severity: "high",
            category: "data_leak",
            rootCause: "Unauthenticated API endpoint exposed in production.",
          },
        },
      },
    );
    expect(res1.status(), "incident.create (first)").toBe(200);
    const json1 = await res1.json();
    const firstId: string = json1.result?.data?.json?.id ?? "";
    expect(firstId, "first incident id").toBeTruthy();

    // Create the second incident — dedup runs asynchronously; wait for suggestion
    const res2 = await page.request.fetch(
      "http://localhost:3001/api/trpc/incident.create",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        data: {
          json: {
            title: "e2e-dedup-test: Auth bypass on chatbot-v2 API",
            severity: "medium",
            category: "data_leak",
            rootCause: "Same endpoint missing auth check.",
          },
        },
      },
    );
    expect(res2.status(), "incident.create (second)").toBe(200);
    const json2 = await res2.json();
    const secondId: string = json2.result?.data?.json?.id ?? "";
    expect(secondId, "second incident id").toBeTruthy();

    // suggestDuplicates fires asynchronously after incident.create returns.
    // Poll until the merge suggestion exists.
    const sug = await waitForMergeSuggestion(secondId);
    expect(sug, "merge suggestion should be created").toBeTruthy();
    expect(sug!.candidateIncidentId).toBe(firstId);

    // Navigate to the second incident detail page and verify the merge banner
    await page.goto(`/en/incidents/${secondId}`);
    await page.waitForLoadState("networkidle");

    const banner = page.locator("text=/similar to/i");
    await expect(banner).toBeVisible();

    // Click Merge — component only invalidates tRPC cache (no navigation)
    const mergeBtn = page.getByRole("button", { name: /merge into/i });
    await expect(mergeBtn).toBeVisible();
    await mergeBtn.click();

    // Wait for the mutation to complete and the row to disappear
    await page
      .waitForResponse(
        (res) =>
          res.url().includes("/api/trpc/incident.mergeInto") &&
          res.status() === 200,
        { timeout: 10_000 },
      )
      .catch(() => {});
    await page.waitForLoadState("networkidle");

    // Navigate back to the list — merged incidents are hidden by default
    await page.goto("/en/incidents");
    await page.waitForLoadState("networkidle");

    const secondRow = page.locator(`a[href*="${secondId}"]`);
    await expect(secondRow).not.toBeVisible();

    // Verify the first incident still exists and is open
    const firstRow = page.locator(`a[href*="${firstId}"]`);
    await expect(firstRow).toBeVisible();
  });

  test("dismiss suggestion → banner disappears", async ({ page }) => {
    // Create two incidents with matching "Auth bypass" titles so dedup fires
    const res1 = await page.request.fetch(
      "http://localhost:3001/api/trpc/incident.create",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        data: {
          json: {
            title: "e2e-dedup-test: Auth bypass on login page",
            severity: "high",
            rootCause: "",
          },
        },
      },
    );
    const firstId: string = (await res1.json()).result?.data?.json?.id ?? "";

    const res2 = await page.request.fetch(
      "http://localhost:3001/api/trpc/incident.create",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        data: {
          json: {
            title: "e2e-dedup-test: Auth bypass on login API",
            severity: "high",
            rootCause: "",
          },
        },
      },
    );
    const secondId: string = (await res2.json()).result?.data?.json?.id ?? "";

    // Wait for dedup suggestion
    const sug = await waitForMergeSuggestion(secondId);
    expect(sug, "suggestion should exist").toBeTruthy();

    await page.goto(`/en/incidents/${secondId}`);
    await page.waitForLoadState("networkidle");

    // Verify banner visible
    await expect(page.locator("text=/similar to/i")).toBeVisible();

    // Dismiss
    const dismissBtn = page.getByRole("button", { name: /dismiss/i });
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // Banner should be gone
    await expect(page.locator("text=/similar to/i")).not.toBeVisible();
  });
});
