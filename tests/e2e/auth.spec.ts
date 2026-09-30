import { test, expect } from "@playwright/test";

// This spec exercises the real registration + UI login flow, so it must start
// without a session (the global setup logs in seeded demo users by default).
//
// reducedMotion is the only spec that needs it: /login and /register are the
// one place GalaxyClient mounts, and its WebGL shader animates on every frame.
// A GitHub runner has no GPU, so that runs through SwiftShader on 2 cores and
// starves everything else — `page.click` on the register button spent a full
// 60s "waiting for element to be visible, enabled and stable" and the retry
// never even saw the password input render. `reduce` makes GalaxyClient pass
// disableAnimation, which stops the frame loop while still mounting the canvas,
// so the tests below keep asserting on the real component.
// (Playwright 1.62 dropped the top-level `reducedMotion` test option; it lives
// under contextOptions now.)
test.use({
  storageState: { cookies: [], origins: [] },
  contextOptions: { reducedMotion: "reduce" },
});

test("register → log in → see dashboard → logout", async ({ page }) => {
  // Date.now() alone collides when two copies of this test start in the same
  // millisecond (a retry racing the original, or `--repeat-each`), and the
  // duplicate email makes auth.register fail with a bare "出了点问题。".
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e+${suffix}@demo.local`;

  // Register a new org/user.
  await page.goto("/zh/register");
  await page.fill('input[name="orgName"]', `E2E Org ${suffix}`);
  await page.fill('input[name="name"]', "E2E User");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "Passw0rd!");
  await page.click('button[type="submit"]');

  // Wait for tRPC auth.register mutation + sign-in redirect to land on dashboard.
  await page.waitForURL("**/zh", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /总览/ })).toBeVisible();

  // Email is in the user menu popover — click the avatar (shows first letter of email).
  await page.getByRole("button", { name: /^E$/ }).click();
  await page.waitForTimeout(500); // let popover animate open
  await expect(page.getByText(email)).toBeVisible();

  // Logout via the logout button inside the popover.
  await page.getByRole("button", { name: /logout|退出|sign out/i }).click();
  await page.waitForURL("**/login", { timeout: 15_000 });
});

test("/login renders the Galaxy canvas (or CSS fallback)", async ({ page }) => {
  await page.goto("/zh/login");
  // GalaxyClient is client-only — the canvas (and the CssStarfield the error
  // boundary falls back to) only exist once hydration runs. A one-shot
  // isVisible() races that mount and reports false; toBeVisible() retries.
  await expect(
    page.locator("canvas, [class*='CssStarfield']").first(),
  ).toBeVisible();
  // Brand tagline (Chinese) is rendered as aria-label on SplitText.
  await expect(page.getByLabel("让 AI，可治、可信、可控。")).toBeVisible();
});

test("/login show-password toggle flips the password input", async ({
  page,
}) => {
  await page.goto("/zh/login");
  const pwd = page.locator('input[name="password"]');
  await expect(pwd).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: /显示密码|show password/i }).click();
  await expect(pwd).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: /隐藏密码|hide password/i }).click();
  await expect(pwd).toHaveAttribute("type", "password");
});

test("/login respects prefers-reduced-motion", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/zh/login");
  // The attribute starts "false" and flips after the hydration effect runs —
  // a one-shot getAttribute races it; toHaveAttribute retries until true.
  await expect(page.locator("[data-reduced-motion]").first()).toHaveAttribute(
    "data-reduced-motion",
    "true",
    { timeout: 10_000 },
  );
  await ctx.close();
});
