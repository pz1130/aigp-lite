import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";

async function makeOrg(name = "M-" + Date.now()) {
  return prisma.organization.create({ data: { name } });
}

async function makeUser(
  email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@t.local`,
) {
  return prisma.user.create({ data: { email, name: "U", passwordHash: "x" } });
}

async function addMember(
  orgId: string,
  userId: string,
  role: "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer",
) {
  return prisma.membership.create({ data: { orgId, userId, role } });
}

function ctxFor(
  orgId: string,
  userId: string,
  role: "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer",
  email = "x@t.local",
) {
  return {
    db: prisma,
    session: { orgId, userId, email, role },
    ip: "127.0.0.1",
  } as const;
}

describe("members.updateRole", () => {
  it("changes role and writes an audit row", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    const target = await makeUser();
    await addMember(org.id, admin.id, "admin");
    await addMember(org.id, target.id, "viewer");

    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    const result = await caller.members.updateRole({
      userId: target.id,
      role: "risk_officer",
    });
    expect(result.role).toBe("risk_officer");

    const audit = await prisma.auditLog.findFirst({
      where: {
        orgId: org.id,
        action: "member.role_change",
        resourceId: target.id,
      },
      orderBy: { ts: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.beforeJson).toMatchObject({ role: "viewer" });
    expect(audit?.afterJson).toMatchObject({ role: "risk_officer" });
  });

  it("rejects self-change", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    await expect(
      caller.members.updateRole({ userId: admin.id, role: "viewer" }),
    ).rejects.toThrow(/own role/i);
  });

  it("rejects callers without org.write", async () => {
    const org = await makeOrg();
    const viewer = await makeUser();
    const target = await makeUser();
    await addMember(org.id, viewer.id, "viewer");
    await addMember(org.id, target.id, "auditor");
    const caller = appRouter.createCaller(
      ctxFor(org.id, viewer.id, "viewer", viewer.email),
    );
    await expect(
      caller.members.updateRole({ userId: target.id, role: "admin" }),
    ).rejects.toThrow();
  });
});

describe("members.invite", () => {
  it("creates a pending invite, lower-cases email, sends an email, and audits", async () => {
    const { emailTransport } = await import("@/lib/notification/email");
    const spy = vi.spyOn(emailTransport, "sendByEmail");

    const org = await makeOrg();
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");

    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    const result = await caller.members.invite({
      email: "NewBie@Demo.local",
      role: "viewer",
    });

    expect(result.id).toBeTruthy();
    const row = await prisma.orgInvite.findUnique({ where: { id: result.id } });
    expect(row?.email).toBe("newbie@demo.local");
    expect(row?.role).toBe("viewer");
    expect(row?.status).toBe("pending");
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 86400_000,
    );

    expect(spy).toHaveBeenCalledOnce();
    const [toEmail, subject, body] = spy.mock.calls[0];
    expect(toEmail).toBe("newbie@demo.local");
    expect(subject).toMatch(/invite/i);
    expect(body).toMatch(/\/accept-invite\?token=/);

    const audit = await prisma.auditLog.findFirst({
      where: { orgId: org.id, action: "member.invite", resourceId: row!.id },
    });
    expect(audit).not.toBeNull();
    spy.mockRestore();
  });

  it("rejects if a Membership already exists for the email", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    const existing = await makeUser(`existing-${Date.now()}@t.local`);
    await addMember(org.id, admin.id, "admin");
    await addMember(org.id, existing.id, "viewer");

    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    await expect(
      caller.members.invite({ email: existing.email, role: "viewer" }),
    ).rejects.toThrow(/already.*member/i);
  });

  it("rejects if a pending non-expired invite for the email already exists", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );

    await caller.members.invite({ email: "dup@demo.local", role: "viewer" });
    await expect(
      caller.members.invite({ email: "dup@demo.local", role: "viewer" }),
    ).rejects.toThrow(/pending/i);
  });

  it("rejects callers without org.write", async () => {
    const org = await makeOrg();
    const viewer = await makeUser();
    await addMember(org.id, viewer.id, "viewer");
    const caller = appRouter.createCaller(
      ctxFor(org.id, viewer.id, "viewer", viewer.email),
    );
    await expect(
      caller.members.invite({ email: "x@y.test", role: "viewer" }),
    ).rejects.toThrow();
  });
});

describe("members.listInvites", () => {
  it("returns pending invites with computed expired flag", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    await caller.members.invite({ email: "alpha@demo.local", role: "viewer" });

    // Force one expired pending invite directly via prisma:
    await prisma.orgInvite.create({
      data: {
        orgId: org.id,
        email: "stale@demo.local",
        role: "viewer",
        tokenHash: "deadbeef".repeat(8),
        expiresAt: new Date(Date.now() - 60_000),
        createdById: admin.id,
      },
    });

    const list = await caller.members.listInvites();
    expect(list.length).toBe(2);
    const alpha = list.find((i) => i.email === "alpha@demo.local")!;
    const stale = list.find((i) => i.email === "stale@demo.local")!;
    expect(alpha.expired).toBe(false);
    expect(stale.expired).toBe(true);
  });
});

describe("members.revokeInvite", () => {
  it("marks the invite revoked and audits", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    const { id } = await caller.members.invite({
      email: "rev@demo.local",
      role: "viewer",
    });

    await caller.members.revokeInvite({ id });

    const row = await prisma.orgInvite.findUnique({ where: { id } });
    expect(row?.status).toBe("revoked");
    const audit = await prisma.auditLog.findFirst({
      where: { orgId: org.id, action: "member.invite_revoke", resourceId: id },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects callers without org.write", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    const viewer = await makeUser();
    await addMember(org.id, admin.id, "admin");
    await addMember(org.id, viewer.id, "viewer");
    const adminCaller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    const { id } = await adminCaller.members.invite({
      email: "rbac@demo.local",
      role: "viewer",
    });
    const viewerCaller = appRouter.createCaller(
      ctxFor(org.id, viewer.id, "viewer", viewer.email),
    );
    await expect(viewerCaller.members.revokeInvite({ id })).rejects.toThrow();
  });
});

describe("members.remove", () => {
  it("removes membership and audits", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    const target = await makeUser();
    await addMember(org.id, admin.id, "admin");
    await addMember(org.id, target.id, "viewer");
    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );

    await caller.members.remove({ userId: target.id });

    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: target.id } },
    });
    expect(m).toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { orgId: org.id, action: "member.remove", resourceId: target.id },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects self-removal", async () => {
    const org = await makeOrg();
    const admin = await makeUser();
    await addMember(org.id, admin.id, "admin");
    const caller = appRouter.createCaller(
      ctxFor(org.id, admin.id, "admin", admin.email),
    );
    await expect(caller.members.remove({ userId: admin.id })).rejects.toThrow(
      /yourself/i,
    );
  });

  it("rejects removing the last admin", async () => {
    // The "last admin" guard prevents the only admin in the org from being removed.
    // With the self-guard already in place, this can only realistically happen via stale session
    // state — actor's session.role is "admin" but target IS the only DB-side admin and target != actor.
    // Construct that scenario: freshOrg with onlyAdmin (admin in DB) and tempActor (viewer in DB, but
    // calling with stale role: "admin" in session). Removal should be blocked by the last-admin guard.
    const freshOrg = await makeOrg();
    const onlyAdmin = await makeUser();
    const tempActor = await makeUser();
    await addMember(freshOrg.id, onlyAdmin.id, "admin");
    await addMember(freshOrg.id, tempActor.id, "viewer");

    const staleCaller = appRouter.createCaller(
      ctxFor(freshOrg.id, tempActor.id, "admin", tempActor.email),
    );
    await expect(
      staleCaller.members.remove({ userId: onlyAdmin.id }),
    ).rejects.toThrow(/last admin/i);
  });
});

import { hashInviteToken, mintInviteToken } from "./invite-token";

async function createInviteFor(
  orgId: string,
  createdById: string,
  email: string,
  role: "viewer" | "admin" = "viewer",
  { expiresAt }: { expiresAt?: Date } = {},
) {
  const raw = mintInviteToken();
  const row = await prisma.orgInvite.create({
    data: {
      orgId,
      email: email.toLowerCase(),
      role,
      tokenHash: hashInviteToken(raw),
      expiresAt: expiresAt ?? new Date(Date.now() + 86400_000),
      createdById,
    },
  });
  return { raw, row };
}

function publicCtx() {
  return { db: prisma, session: null, ip: "127.0.0.1" } as const;
}

function sessionCtx(
  orgId: string,
  userId: string,
  email: string,
  role: "admin" | "viewer" = "viewer",
) {
  return {
    db: prisma,
    session: { orgId, userId, email, role },
    ip: "127.0.0.1",
  } as const;
}

describe("members.acceptInvite — token validation", () => {
  it("rejects unknown token", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(
      caller.members.acceptInvite({ token: "deadbeef" }),
    ).rejects.toThrow(/invalid/i);
  });

  it("rejects expired token", async () => {
    const org = await makeOrg();
    const inviter = await makeUser();
    await addMember(org.id, inviter.id, "admin");
    const { raw } = await createInviteFor(
      org.id,
      inviter.id,
      "exp@demo.local",
      "viewer",
      {
        expiresAt: new Date(Date.now() - 1000),
      },
    );
    const caller = appRouter.createCaller(publicCtx());
    await expect(caller.members.acceptInvite({ token: raw })).rejects.toThrow(
      /expired/i,
    );
  });

  it("rejects revoked token", async () => {
    const org = await makeOrg();
    const inviter = await makeUser();
    await addMember(org.id, inviter.id, "admin");
    const { raw, row } = await createInviteFor(
      org.id,
      inviter.id,
      "revoked@demo.local",
    );
    await prisma.orgInvite.update({
      where: { id: row.id },
      data: { status: "revoked" },
    });
    const caller = appRouter.createCaller(publicCtx());
    await expect(caller.members.acceptInvite({ token: raw })).rejects.toThrow(
      /revoked/i,
    );
  });
});

describe("members.acceptInvite — branches", () => {
  it("logged-in matching email adds membership and marks accepted", async () => {
    const org = await makeOrg();
    const inviter = await makeUser();
    const invitee = await makeUser(`inv-${Date.now()}@demo.local`);
    await addMember(org.id, inviter.id, "admin");
    const { raw, row } = await createInviteFor(
      org.id,
      inviter.id,
      invitee.email,
      "viewer",
    );

    // Invitee is logged into a different org; in this test they have no membership in `org` yet.
    const otherOrg = await makeOrg();
    await addMember(otherOrg.id, invitee.id, "viewer");
    const caller = appRouter.createCaller(
      sessionCtx(otherOrg.id, invitee.id, invitee.email, "viewer"),
    );
    const result = await caller.members.acceptInvite({ token: raw });
    expect(result.added).toBe(true);

    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: invitee.id } },
    });
    expect(m?.role).toBe("viewer");

    const fresh = await prisma.orgInvite.findUnique({ where: { id: row.id } });
    expect(fresh?.status).toBe("accepted");
    expect(fresh?.acceptedByUserId).toBe(invitee.id);
  });

  it("logged-in mismatched email returns email_mismatch", async () => {
    const org = await makeOrg();
    const inviter = await makeUser();
    const wrong = await makeUser(`wrong-${Date.now()}@demo.local`);
    await addMember(org.id, inviter.id, "admin");
    await addMember(org.id, wrong.id, "viewer");
    const { raw } = await createInviteFor(
      org.id,
      inviter.id,
      "someone-else@demo.local",
    );
    const caller = appRouter.createCaller(
      sessionCtx(org.id, wrong.id, wrong.email, "viewer"),
    );
    await expect(caller.members.acceptInvite({ token: raw })).rejects.toThrow(
      /email_mismatch/i,
    );
  });

  it("anonymous + new user + password creates user + membership + accepted", async () => {
    const org = await makeOrg();
    const inviter = await makeUser();
    await addMember(org.id, inviter.id, "admin");
    const inviteeEmail = `fresh-${Date.now()}@demo.local`;
    const { raw } = await createInviteFor(
      org.id,
      inviter.id,
      inviteeEmail,
      "viewer",
    );
    const caller = appRouter.createCaller(publicCtx());
    const result = await caller.members.acceptInvite({
      token: raw,
      password: "hunter22hunter22",
    });
    expect("added" in result && result.added).toBe(true);
    expect("signInRequired" in result && result.signInRequired).toBe(true);

    const u = await prisma.user.findUnique({ where: { email: inviteeEmail } });
    expect(u?.passwordHash).toBeTruthy();
    const m = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: u!.id } },
    });
    expect(m?.role).toBe("viewer");
  });

  it("anonymous + new user + no password returns next: set_password (no SSO domain match)", async () => {
    const old = process.env.SSO_OIDC_ALLOWED_DOMAINS;
    process.env.SSO_OIDC_ALLOWED_DOMAINS = "";
    const org = await makeOrg();
    const inviter = await makeUser();
    await addMember(org.id, inviter.id, "admin");
    const { raw } = await createInviteFor(
      org.id,
      inviter.id,
      `np-${Date.now()}@demo.local`,
      "viewer",
    );
    const caller = appRouter.createCaller(publicCtx());
    const result = await caller.members.acceptInvite({ token: raw });
    expect("next" in result && result.next).toBe("set_password");
    if (old === undefined) delete process.env.SSO_OIDC_ALLOWED_DOMAINS;
    else process.env.SSO_OIDC_ALLOWED_DOMAINS = old;
  });

  it("anonymous + new user + email domain in SSO list returns next: sso", async () => {
    const old = process.env.SSO_OIDC_ALLOWED_DOMAINS;
    process.env.SSO_OIDC_ALLOWED_DOMAINS = "demo.local,example.com";
    const org = await makeOrg();
    const inviter = await makeUser();
    await addMember(org.id, inviter.id, "admin");
    const { raw } = await createInviteFor(
      org.id,
      inviter.id,
      `sso-${Date.now()}@demo.local`,
      "viewer",
    );
    const caller = appRouter.createCaller(publicCtx());
    const result = await caller.members.acceptInvite({ token: raw });
    expect("next" in result && result.next).toBe("sso");
    if (old === undefined) delete process.env.SSO_OIDC_ALLOWED_DOMAINS;
    else process.env.SSO_OIDC_ALLOWED_DOMAINS = old;
  });
});
