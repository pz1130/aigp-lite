import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { provisionOidcUser } from "./jit";
import * as audit from "@/lib/audit/log";
import { __resetBootFlagForTests, type SsoConfig } from "./config";

const ORIG = { ...process.env };
let orgId: string;

beforeEach(async () => {
  process.env = { ...ORIG };
  __resetBootFlagForTests();
  vi.restoreAllMocks();

  const org = await prisma.organization.create({
    data: { name: "JIT-" + Date.now() },
  });
  orgId = org.id;
  process.env.SSO_OIDC_ISSUER = "https://idp.example.com";
  process.env.SSO_OIDC_CLIENT_ID = "cid";
  process.env.SSO_OIDC_CLIENT_SECRET = "sec";
  process.env.SSO_OIDC_ORG_ID = orgId;
});
afterEach(() => {
  process.env = ORIG;
});

describe("provisionOidcUser", () => {
  it("rejects when email_verified is false", async () => {
    const spy = vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const r = await provisionOidcUser({
      sub: "s1",
      email: "a@b.com",
      name: "A",
      emailVerified: false,
    });
    expect(r).toEqual({ ok: false, reason: "email_unverified" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].action).toBe("auth.sso.rejected");
  });

  it("rejects when email empty", async () => {
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const r = await provisionOidcUser({
      sub: "s1",
      email: "",
      name: null,
      emailVerified: true,
    });
    expect(r).toEqual({ ok: false, reason: "email_unverified" });
  });

  it("rejects when domain not allowed", async () => {
    process.env.SSO_OIDC_ALLOWED_DOMAINS = "example.com";
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const r = await provisionOidcUser({
      sub: "s1",
      email: "alice@evil.io",
      name: "A",
      emailVerified: true,
    });
    expect(r).toEqual({ ok: false, reason: "domain_not_allowed" });
    const after = await prisma.user.findFirst({
      where: { email: "alice@evil.io" },
    });
    expect(after).toBeNull();
  });

  it("rejects when org does not exist at runtime", async () => {
    process.env.SSO_OIDC_ORG_ID = "org_does_not_exist";
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const r = await provisionOidcUser({
      sub: "s1",
      email: "a@b.com",
      name: "A",
      emailVerified: true,
    });
    expect(r).toEqual({ ok: false, reason: "org_missing" });
  });

  it("creates new user + viewer membership on brand-new identity", async () => {
    const spy = vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `new-${Date.now()}@example.com`;
    const r = await provisionOidcUser({
      sub: "sub-new",
      email,
      name: "Alice",
      emailVerified: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.firstTime).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.oidcSubject).toBe("sub-new");
    expect(user!.passwordHash).toBeNull();

    const m = await prisma.membership.findFirst({
      where: { userId: user!.id },
    });
    expect(m!.orgId).toBe(orgId);
    expect(m!.role).toBe("viewer");

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].action).toBe("auth.sso.login");
    const after = spy.mock.calls[0][0].after as { firstTime: boolean };
    expect(after.firstTime).toBe(true);
  });

  it("links existing credentials user (same email, no oidcSubject) without touching passwordHash", async () => {
    const email = `cred-${Date.now()}@example.com`;
    const credUser = await prisma.user.create({
      data: { email, name: "Bob", passwordHash: "hash-existing" },
    });
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);

    const r = await provisionOidcUser({
      sub: "sub-link",
      email,
      name: "Bob",
      emailVerified: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.linked).toBe(true);
    expect(r.firstTime).toBe(false);

    const updated = await prisma.user.findUnique({
      where: { id: credUser.id },
    });
    expect(updated!.oidcSubject).toBe("sub-link");
    expect(updated!.passwordHash).toBe("hash-existing");
  });

  it("rejects subject_conflict when same email has different oidcSubject", async () => {
    const email = `conflict-${Date.now()}@example.com`;
    await prisma.user.create({
      data: { email, name: "C", oidcSubject: "sub-A" },
    });
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);

    const r = await provisionOidcUser({
      sub: "sub-B",
      email,
      name: "C",
      emailVerified: true,
    });
    expect(r).toEqual({ ok: false, reason: "subject_conflict" });

    const stillA = await prisma.user.findUnique({ where: { email } });
    expect(stillA!.oidcSubject).toBe("sub-A");
  });

  it("returning SSO user with changed email gets email updated", async () => {
    const oldEmail = `old-${Date.now()}@example.com`;
    const newEmail = `new-${Date.now()}@example.com`;
    await prisma.user.create({
      data: { email: oldEmail, oidcSubject: "sub-rename" },
    });
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);

    const r = await provisionOidcUser({
      sub: "sub-rename",
      email: newEmail,
      name: "C",
      emailVerified: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.firstTime).toBe(false);

    const updated = await prisma.user.findUnique({
      where: { oidcSubject: "sub-rename" },
    });
    expect(updated!.email).toBe(newEmail);
  });

  it("idempotent: returning SSO user produces no extra membership row", async () => {
    const email = `repeat-${Date.now()}@example.com`;
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);

    await provisionOidcUser({
      sub: "sub-repeat",
      email,
      name: "R",
      emailVerified: true,
    });
    const before = await prisma.membership.count();
    await provisionOidcUser({
      sub: "sub-repeat",
      email,
      name: "R",
      emailVerified: true,
    });
    const after = await prisma.membership.count();
    expect(after).toBe(before);
  });

  it("assigns a role from groupRoleMap when the profile carries a matching groups claim", async () => {
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `grp-${Date.now()}@example.com`;
    const cfg: SsoConfig = {
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "sec",
      orgId,
      buttonLabel: "SSO",
      allowedDomains: null,
      groupRoleMap: { groups: { "platform-admins": "admin" } },
    };
    const r = await provisionOidcUser(
      {
        sub: "sub-grp",
        email,
        name: "G",
        emailVerified: true,
        claims: { groups: ["platform-admins"] },
      },
      cfg,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const user = await prisma.user.findUnique({ where: { email } });
    const m = await prisma.membership.findFirst({
      where: { userId: user!.id },
    });
    expect(m!.role).toBe("admin");
  });

  it("falls back to viewer when groups claim does not match the map", async () => {
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const email = `grp2-${Date.now()}@example.com`;
    const cfg: SsoConfig = {
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "sec",
      orgId,
      buttonLabel: "SSO",
      allowedDomains: null,
      groupRoleMap: { groups: { "platform-admins": "admin" } },
    };
    const r = await provisionOidcUser(
      {
        sub: "sub-grp2",
        email,
        name: "G",
        emailVerified: true,
        claims: { groups: ["randoms"] },
      },
      cfg,
    );
    expect(r.ok).toBe(true);
    const user = await prisma.user.findUnique({ where: { email } });
    const m = await prisma.membership.findFirst({
      where: { userId: user!.id },
    });
    expect(m!.role).toBe("viewer");
  });

  it("enforces the domain allow-list from the resolved connection (not env)", async () => {
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const cfg: SsoConfig = {
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "sec",
      orgId,
      buttonLabel: "SSO",
      allowedDomains: ["allowed.com"],
      groupRoleMap: null,
    };
    const rejected = await provisionOidcUser(
      {
        sub: "sub-dom",
        email: "user@blocked.io",
        name: "D",
        emailVerified: true,
      },
      cfg,
    );
    expect(rejected).toEqual({ ok: false, reason: "domain_not_allowed" });

    const ok = await provisionOidcUser(
      {
        sub: "sub-dom2",
        email: `ok-${Date.now()}@allowed.com`,
        name: "D",
        emailVerified: true,
      },
      cfg,
    );
    expect(ok.ok).toBe(true);
  });
});
