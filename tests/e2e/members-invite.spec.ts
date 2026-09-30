import { test, expect } from "@playwright/test";
import { storageStateFor } from "./helpers/auth";

test.use({ storageState: storageStateFor("admin") });

test.describe("Members invite", () => {
  test("admin invites a new user, who appears in the pending panel", async ({
    page,
  }) => {
    await page.goto("/en/members");
    await expect(
      page.getByRole("heading", { name: "Team Members" }),
    ).toBeVisible();

    // Open invite dialog and submit.
    const inviteEmail = `e2e-${Date.now()}@demo.local`;
    await page.getByRole("button", { name: /Invite member/i }).click();
    await page.getByPlaceholder("name@example.com").fill(inviteEmail);
    await page.getByRole("button", { name: /Send invitation/i }).click();

    // Pending invites panel should now contain the email.
    await expect(page.getByText(inviteEmail)).toBeVisible({ timeout: 5000 });

    // Reload to confirm persistence.
    await page.reload();
    await expect(page.getByText(inviteEmail)).toBeVisible();
  });

  test("new invitee accepts via set-password and becomes a member", async ({
    page,
    request,
    browser,
  }) => {
    const inviteEmail = `e2e-accept-${Date.now()}@demo.local`;

    // 1. Admin sends the invite.
    await page.goto("/en/members");
    await expect(
      page.getByRole("heading", { name: "Team Members" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Invite member/i }).click();
    await page.getByPlaceholder("name@example.com").fill(inviteEmail);
    await page.getByRole("button", { name: /Send invitation/i }).click();
    await expect(page.getByText(inviteEmail)).toBeVisible({ timeout: 5000 });

    // 2. Read the raw token from the test-mode outbox.
    const res = await request.get(
      `/api/test/outbox?email=${encodeURIComponent(inviteEmail)}`,
    );
    expect(res.ok()).toBeTruthy();
    const { token } = (await res.json()) as { token: string | null };
    expect(token).toBeTruthy();

    // 3. Accept in a fresh, genuinely anonymous context. `browser.newContext()`
    //    inherits the file-level admin `storageState` unless we override it, so
    //    pass an empty storage state — otherwise the accept runs as the admin
    //    (logged-in branch) and fails with email_mismatch. A separate context
    //    also keeps the admin `page` signed in for the membership check below.
    const anon = await browser.newContext({
      baseURL: "http://localhost:3001",
      storageState: { cookies: [], origins: [] },
    });
    try {
      const anonPage = await anon.newPage();
      await anonPage.goto(
        `/en/accept-invite?token=${encodeURIComponent(token!)}`,
      );

      // 4. Set-password form appears; submit a password.
      const pwd = anonPage.locator('input[type="password"]');
      await expect(pwd).toBeVisible({ timeout: 5000 });
      await pwd.fill("hunter2pass");
      await anonPage.getByRole("button", { name: "Accept invitation" }).click();

      // Accepting a fresh invite redirects to sign-in.
      await anonPage.waitForURL(/\/signin/, { timeout: 10000 });
    } finally {
      await anon.close();
    }

    // 5. Back as admin, the invitee is now a member (membership row created):
    //    the pending invite was consumed, so the email now shows in the
    //    members table rather than the pending panel.
    await page.goto("/en/members");
    await expect(page.getByRole("cell", { name: inviteEmail })).toBeVisible({
      timeout: 5000,
    });
  });
});
