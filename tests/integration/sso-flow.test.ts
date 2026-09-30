import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { provisionOidcUser } from "@/lib/auth/sso/jit";
import { __resetBootFlagForTests } from "@/lib/auth/sso/config";
import * as audit from "@/lib/audit/log";

const ORIG = { ...process.env };
let orgId: string;

beforeEach(async () => {
  process.env = { ...ORIG };
  __resetBootFlagForTests();
  vi.restoreAllMocks();
  vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);

  const org = await prisma.organization.create({
    data: { name: "INT-" + Date.now() },
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

describe("SSO integration flow", () => {
  it("scenario 1 — brand new SSO user gets viewer membership in the target org", async () => {
    const email = `new-${Date.now()}@example.com`;
    const usersBefore = await prisma.user.count();
    const membershipsBefore = await prisma.membership.count();

    const r = await provisionOidcUser({
      sub: "s1-" + Date.now(),
      email,
      name: "A",
      emailVerified: true,
    });
    expect(r.ok).toBe(true);

    expect(await prisma.user.count()).toBe(usersBefore + 1);
    expect(await prisma.membership.count()).toBe(membershipsBefore + 1);

    const m = await prisma.membership.findFirst({ where: { user: { email } } });
    expect(m!.orgId).toBe(orgId);
    expect(m!.role).toBe("viewer");
  });

  it("scenario 2 — existing credentials user, same email, gets linked", async () => {
    const email = `cred-${Date.now()}@example.com`;
    const credUser = await prisma.user.create({
      data: { email, name: "B", passwordHash: "hash" },
    });
    const membershipsBefore = await prisma.membership.count({
      where: { userId: credUser.id },
    });

    const r = await provisionOidcUser({
      sub: "s2",
      email,
      name: "B",
      emailVerified: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.linked).toBe(true);

    const updated = await prisma.user.findUnique({
      where: { id: credUser.id },
    });
    expect(updated!.passwordHash).toBe("hash");
    expect(updated!.oidcSubject).toBe("s2");

    const m = await prisma.membership.count({ where: { userId: credUser.id } });
    expect(m).toBe(membershipsBefore + 1);
  });

  it("scenario 3 — subject conflict rejects and changes nothing", async () => {
    const ts = Date.now();
    const email = `conf-${ts}@example.com`;
    await prisma.user.create({ data: { email, oidcSubject: `sub-A-${ts}` } });
    const usersBefore = await prisma.user.count();
    const membershipsBefore = await prisma.membership.count();

    const r = await provisionOidcUser({
      sub: `sub-B-${ts}`,
      email,
      name: null,
      emailVerified: true,
    });
    expect(r).toEqual({ ok: false, reason: "subject_conflict" });

    expect(await prisma.user.count()).toBe(usersBefore);
    expect(await prisma.membership.count()).toBe(membershipsBefore);
  });

  it("scenario 4 — domain whitelist blocks user, zero DB side effects", async () => {
    process.env.SSO_OIDC_ALLOWED_DOMAINS = "example.com";
    const usersBefore = await prisma.user.count();
    const membershipsBefore = await prisma.membership.count();

    const r = await provisionOidcUser({
      sub: "s4",
      email: `a-${Date.now()}@evil.io`,
      name: "X",
      emailVerified: true,
    });
    expect(r).toEqual({ ok: false, reason: "domain_not_allowed" });

    expect(await prisma.user.count()).toBe(usersBefore);
    expect(await prisma.membership.count()).toBe(membershipsBefore);
  });

  it("scenario 5 — returning SSO user with changed email updates email and not counts", async () => {
    const oldEmail = `old-${Date.now()}@example.com`;
    const newEmail = `new-${Date.now()}@example.com`;
    const sub = "s5-" + Date.now();
    await provisionOidcUser({
      sub,
      email: oldEmail,
      name: "C",
      emailVerified: true,
    });
    const usersBefore = await prisma.user.count();
    const membershipsBefore = await prisma.membership.count();

    const r = await provisionOidcUser({
      sub,
      email: newEmail,
      name: "C",
      emailVerified: true,
    });
    expect(r.ok).toBe(true);

    expect(await prisma.user.count()).toBe(usersBefore);
    expect(await prisma.membership.count()).toBe(membershipsBefore);

    const u = await prisma.user.findUnique({ where: { oidcSubject: sub } });
    expect(u!.email).toBe(newEmail);
  });
});
