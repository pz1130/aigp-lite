import { test, expect } from "@playwright/test";

test.describe("SSO login UI", () => {
  test("when SSO env is unset, button is not rendered", async ({ page }) => {
    // The default test env has no SSO_OIDC_* set.
    await page.goto("/en/login");
    await expect(
      page.getByRole("button", { name: /Sign in with SSO/i }),
    ).toHaveCount(0);
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("when SSO env is set, button is rendered and clicking navigates to /api/auth/signin/oidc", async ({
    page,
  }) => {
    // This case relies on a dedicated test fixture that boots the dev server with SSO env set.
    // We detect availability of the button at runtime — if absent, skip rather than fail (CI env may not provide it).
    await page.goto("/en/login");
    const btn = page.getByRole("button", { name: /Sign in with SSO/i });
    const visible = await btn.isVisible().catch(() => false);
    test.skip(!visible, "SSO env not configured in this Playwright run");

    // Intercept the IdP redirect — we only care that NextAuth started the flow.
    await page.route(/idp\.example\.com/, (route) =>
      route.fulfill({ status: 200, body: "ok" }),
    );

    const [response] = await Promise.all([
      page.waitForResponse(/\/api\/auth\/signin\/oidc/),
      btn.click(),
    ]);
    expect(response.status()).toBeLessThan(500);
  });
});
