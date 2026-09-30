// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import { decryptJson } from "@/lib/crypto/secrets";

type Role = "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";

async function makeOrg(
  name = "SSO-R-" + Date.now() + "-" + Math.random().toString(36).slice(2),
) {
  return prisma.organization.create({ data: { name } });
}
async function makeUser() {
  const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@t.local`;
  return prisma.user.create({ data: { email, name: "U", passwordHash: "x" } });
}
function ctxFor(orgId: string, userId: string, role: Role) {
  return {
    db: prisma,
    session: { orgId, userId, email: "x@t.local", role },
    ip: "127.0.0.1",
  } as const;
}

async function adminCaller() {
  const org = await makeOrg();
  const admin = await makeUser();
  await prisma.membership.create({
    data: { orgId: org.id, userId: admin.id, role: "admin" },
  });
  return {
    org,
    admin,
    caller: appRouter.createCaller(ctxFor(org.id, admin.id, "admin")),
  };
}

const VALID = {
  issuer: "https://idp.example.com",
  clientId: "cid",
  clientSecret: "super-secret",
};

describe("sso router — authorization", () => {
  it("rejects a non-admin caller with FORBIDDEN", async () => {
    const org = await makeOrg();
    const viewer = await makeUser();
    await prisma.membership.create({
      data: { orgId: org.id, userId: viewer.id, role: "viewer" },
    });
    const caller = appRouter.createCaller(ctxFor(org.id, viewer.id, "viewer"));
    await expect(caller.sso.upsert(VALID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.sso.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("sso router — upsert + get", () => {
  it("upsert round-trips and get returns a redacted view (no secret)", async () => {
    const { org, caller } = await adminCaller();
    const created = await caller.sso.upsert({
      ...VALID,
      buttonLabel: "Corp SSO",
      allowedDomains: ["corp.com"],
      groupRoleMap: { groups: { admins: "admin" } },
    });
    expect(created).toMatchObject({
      orgId: org.id,
      issuer: VALID.issuer,
      clientId: VALID.clientId,
      buttonLabel: "Corp SSO",
      allowedDomains: ["corp.com"],
      hasSecret: true,
      enabled: true,
    });
    // The secret must never cross the server boundary.
    expect(JSON.stringify(created)).not.toContain("super-secret");
    expect("clientSecret" in (created as object)).toBe(false);
    expect("clientSecretEncrypted" in (created as object)).toBe(false);

    const got = await caller.sso.get();
    expect(got).toMatchObject({
      orgId: org.id,
      issuer: VALID.issuer,
      hasSecret: true,
    });
    expect(JSON.stringify(got)).not.toContain("super-secret");

    // But the secret IS stored, encrypted, and decrypts on the server.
    const row = await prisma.ssoConnection.findUnique({
      where: { orgId: org.id },
    });
    expect(decryptJson<string>(Buffer.from(row!.clientSecretEncrypted))).toBe(
      "super-secret",
    );
  });

  it("get returns null when no connection exists", async () => {
    const { caller } = await adminCaller();
    expect(await caller.sso.get()).toBeNull();
  });

  it("is org-scoped: upsert touches only the caller's org", async () => {
    const a = await adminCaller();
    const b = await adminCaller();
    await a.caller.sso.upsert(VALID);
    expect(await b.caller.sso.get()).toBeNull();
    expect(
      await prisma.ssoConnection.findUnique({ where: { orgId: b.org.id } }),
    ).toBeNull();
  });
});

describe("sso router — rotateSecret + setEnabled", () => {
  it("rotateSecret replaces the ciphertext", async () => {
    const { org, caller } = await adminCaller();
    await caller.sso.upsert(VALID);
    const before = await prisma.ssoConnection.findUnique({
      where: { orgId: org.id },
    });
    await caller.sso.rotateSecret({ clientSecret: "rotated-secret" });
    const after = await prisma.ssoConnection.findUnique({
      where: { orgId: org.id },
    });
    expect(
      Buffer.from(after!.clientSecretEncrypted).equals(
        Buffer.from(before!.clientSecretEncrypted),
      ),
    ).toBe(false);
    expect(decryptJson<string>(Buffer.from(after!.clientSecretEncrypted))).toBe(
      "rotated-secret",
    );
  });

  it("setEnabled flips the enabled flag", async () => {
    const { org, caller } = await adminCaller();
    await caller.sso.upsert(VALID);
    await caller.sso.setEnabled({ enabled: false });
    expect(
      (await prisma.ssoConnection.findUnique({ where: { orgId: org.id } }))!
        .enabled,
    ).toBe(false);
    await caller.sso.setEnabled({ enabled: true });
    expect(
      (await prisma.ssoConnection.findUnique({ where: { orgId: org.id } }))!
        .enabled,
    ).toBe(true);
  });
});
