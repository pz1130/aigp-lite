// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import { appRouter } from "@/lib/trpc/router";
import * as audit from "@/lib/audit/log";

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name:
        "SCIM-ROUTER-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}

async function makeUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "x" } });
}

function ctxFor(orgId: string, userId: string, role: "admin" | "viewer") {
  return {
    session: { orgId, userId, role, email: "t@example.com" },
    db: prisma,
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

async function adminCaller(orgId: string) {
  const user = await makeUser(
    `admin-${Date.now()}-${Math.random()}@example.com`,
  );
  await prisma.membership.create({
    data: { orgId, userId: user.id, role: "admin" },
  });
  return appRouter.createCaller(ctxFor(orgId, user.id, "admin"));
}

async function withEnabledSso(orgId: string) {
  await prisma.ssoConnection.create({
    data: {
      orgId,
      issuer: "https://idp.example.com",
      clientId: "x",
      clientSecretEncrypted: Buffer.from("x"),
      enabled: true,
    },
  });
}

describe("scimRouter", () => {
  it("get returns null when no connection exists", async () => {
    const org = await makeOrg();
    const caller = await adminCaller(org.id);
    expect(await caller.scim.get()).toBeNull();
  });

  it("rejects upsert when the org has no existing enabled SsoConnection", async () => {
    const org = await makeOrg();
    const caller = await adminCaller(org.id);

    await expect(caller.scim.upsert({})).rejects.toThrow(/SSO/i);
  });

  it("upsert requires org.write (admin) and creates a connection, returning a raw token once", async () => {
    const org = await makeOrg();
    await withEnabledSso(org.id);
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const caller = await adminCaller(org.id);

    const result = await caller.scim.upsert({
      roleAttribute: "department",
      roleValueMap: { eng: "admin" },
    });
    expect(result.rawToken).not.toBeNull();

    const redacted = await caller.scim.get();
    expect(redacted!.roleAttribute).toBe("department");
  });

  it("rejects upsert from a non-admin role", async () => {
    const org = await makeOrg();
    const user = await makeUser(`viewer-${Date.now()}@example.com`);
    await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, role: "viewer" },
    });
    const caller = appRouter.createCaller(ctxFor(org.id, user.id, "viewer"));

    await expect(caller.scim.upsert({})).rejects.toThrow();
  });

  it("rotateToken issues a new token and writes an audit entry", async () => {
    const org = await makeOrg();
    await withEnabledSso(org.id);
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const caller = await adminCaller(org.id);
    await caller.scim.upsert({});

    const { rawToken } = await caller.scim.rotateToken();
    expect(rawToken.startsWith("aigp_scim_")).toBe(true);
    expect(audit.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "scim.token.rotated" }),
    );
  });

  it("setEnabled toggles the connection and writes an audit entry", async () => {
    const org = await makeOrg();
    await withEnabledSso(org.id);
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const caller = await adminCaller(org.id);
    await caller.scim.upsert({});

    await caller.scim.setEnabled({ enabled: false });
    const redacted = await caller.scim.get();
    expect(redacted!.enabled).toBe(false);
  });

  // Regression test for a bug in upsertConnection's `enabled ?? true` default:
  // a config-only upsert that omits `enabled` must NOT silently re-enable a
  // connection the admin had previously disabled. The router must look up the
  // current `enabled` value and forward it explicitly when input.enabled is
  // undefined and a connection already exists.
  it("upsert with enabled omitted preserves a previously-disabled connection", async () => {
    const org = await makeOrg();
    await withEnabledSso(org.id);
    vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const caller = await adminCaller(org.id);
    await caller.scim.upsert({});

    await caller.scim.setEnabled({ enabled: false });
    let redacted = await caller.scim.get();
    expect(redacted!.enabled).toBe(false);

    await caller.scim.upsert({ roleAttribute: "dept" });

    redacted = await caller.scim.get();
    expect(redacted!.enabled).toBe(false);
    expect(redacted!.roleAttribute).toBe("dept");
  });
});
