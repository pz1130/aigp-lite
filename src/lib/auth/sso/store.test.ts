// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto/secrets";
import {
  upsertConnection,
  getRedacted,
  rotateSecret,
  setEnabled,
  resolveSsoConfig,
  resolveProviderConfig,
  isSsoAvailable,
} from "./store";

const ORIG = { ...process.env };
let orgId: string;

beforeEach(async () => {
  process.env = { ...ORIG };
  // Ensure env SSO is OFF unless a test opts in, so resolveSsoConfig fallback is deterministic.
  delete process.env.SSO_OIDC_ISSUER;
  delete process.env.SSO_OIDC_CLIENT_ID;
  delete process.env.SSO_OIDC_CLIENT_SECRET;
  delete process.env.SSO_OIDC_ORG_ID;
  // Isolate connection-set assertions (resolveProviderConfig's sole-connection path).
  await prisma.ssoConnection.deleteMany({});
  const org = await prisma.organization.create({
    data: { name: "SSO-Store-" + Date.now() },
  });
  orgId = org.id;
});
afterEach(() => {
  process.env = ORIG;
});

describe("upsertConnection", () => {
  it("encrypts the client secret at rest (stored value is not plaintext)", async () => {
    await upsertConnection(orgId, {
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "super-secret-value",
    });
    const row = await prisma.ssoConnection.findUnique({ where: { orgId } });
    expect(row).not.toBeNull();
    const bytes = Buffer.from(row!.clientSecretEncrypted);
    // Ciphertext must not contain the plaintext.
    expect(bytes.toString("utf8")).not.toContain("super-secret-value");
    // And it must round-trip back to the original secret.
    expect(decryptJson<string>(bytes)).toBe("super-secret-value");
  });

  it("updates an existing connection in place (one IdP per org)", async () => {
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "s1",
    });
    await upsertConnection(orgId, {
      issuer: "https://b",
      clientId: "c2",
      clientSecret: "s2",
      buttonLabel: "Acme SSO",
      allowedDomains: ["acme.io"],
    });
    const rows = await prisma.ssoConnection.findMany({ where: { orgId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].issuer).toBe("https://b");
    expect(rows[0].buttonLabel).toBe("Acme SSO");
    expect(rows[0].allowedDomains).toEqual(["acme.io"]);
  });

  it("preserves the stored secret when updating without a new one", async () => {
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "keep-me",
    });
    // Update metadata only — no clientSecret supplied.
    await upsertConnection(orgId, {
      issuer: "https://a2",
      clientId: "c1",
      buttonLabel: "Updated",
    });
    const row = await prisma.ssoConnection.findUnique({ where: { orgId } });
    expect(row!.issuer).toBe("https://a2");
    expect(row!.buttonLabel).toBe("Updated");
    expect(decryptJson<string>(Buffer.from(row!.clientSecretEncrypted))).toBe(
      "keep-me",
    );
  });

  it("rejects creating a new connection without a secret", async () => {
    await expect(
      upsertConnection(orgId, { issuer: "https://a", clientId: "c1" }),
    ).rejects.toThrow(/secret is required/i);
  });
});

describe("getRedacted", () => {
  it("returns connection metadata without ever exposing the secret", async () => {
    await upsertConnection(orgId, {
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "do-not-leak",
      buttonLabel: "Corp SSO",
      allowedDomains: ["corp.com"],
    });
    const red = await getRedacted(orgId);
    expect(red).not.toBeNull();
    expect(red).toMatchObject({
      orgId,
      issuer: "https://idp.example.com",
      clientId: "cid",
      buttonLabel: "Corp SSO",
      allowedDomains: ["corp.com"],
      enabled: true,
      hasSecret: true,
    });
    // No secret field of any kind in the redacted view.
    expect(JSON.stringify(red)).not.toContain("do-not-leak");
    expect("clientSecret" in (red as object)).toBe(false);
    expect("clientSecretEncrypted" in (red as object)).toBe(false);
  });

  it("returns null when no connection exists", async () => {
    expect(await getRedacted(orgId)).toBeNull();
  });
});

describe("rotateSecret + setEnabled", () => {
  it("rotateSecret replaces the ciphertext, leaving other fields intact", async () => {
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "old",
    });
    const before = await prisma.ssoConnection.findUnique({ where: { orgId } });
    await rotateSecret(orgId, "new-secret");
    const after = await prisma.ssoConnection.findUnique({ where: { orgId } });
    expect(
      Buffer.from(after!.clientSecretEncrypted).equals(
        Buffer.from(before!.clientSecretEncrypted),
      ),
    ).toBe(false);
    expect(decryptJson<string>(Buffer.from(after!.clientSecretEncrypted))).toBe(
      "new-secret",
    );
    expect(after!.issuer).toBe("https://a");
  });

  it("setEnabled flips the enabled flag", async () => {
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "s1",
    });
    await setEnabled(orgId, false);
    expect(
      (await prisma.ssoConnection.findUnique({ where: { orgId } }))!.enabled,
    ).toBe(false);
    await setEnabled(orgId, true);
    expect(
      (await prisma.ssoConnection.findUnique({ where: { orgId } }))!.enabled,
    ).toBe(true);
  });
});

describe("resolveSsoConfig", () => {
  it("returns the DB connection (decrypted) when an enabled connection matches the hint", async () => {
    await upsertConnection(orgId, {
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "sec",
      buttonLabel: "DB SSO",
      allowedDomains: ["example.com"],
      groupRoleMap: { groups: { admins: "admin" } },
    });
    const cfg = await resolveSsoConfig(orgId);
    expect(cfg).not.toBeNull();
    expect(cfg).toMatchObject({
      issuer: "https://idp.example.com",
      clientId: "cid",
      clientSecret: "sec",
      orgId,
      buttonLabel: "DB SSO",
      allowedDomains: ["example.com"],
      groupRoleMap: { groups: { admins: "admin" } },
    });
  });

  it("treats an empty allowedDomains list as no restriction (null)", async () => {
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "s1",
    });
    const cfg = await resolveSsoConfig(orgId);
    expect(cfg!.allowedDomains).toBeNull();
  });

  it("does not return a disabled connection", async () => {
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "s1",
      enabled: false,
    });
    expect(await resolveSsoConfig(orgId)).toBeNull();
  });

  it("falls back to env config when no DB connection matches", async () => {
    process.env.SSO_OIDC_ISSUER = "https://env-idp";
    process.env.SSO_OIDC_CLIENT_ID = "env-cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "env-sec";
    process.env.SSO_OIDC_ORG_ID = orgId;
    const cfg = await resolveSsoConfig("no-such-org");
    expect(cfg).not.toBeNull();
    expect(cfg!.issuer).toBe("https://env-idp");
    expect(cfg!.orgId).toBe(orgId);
  });

  it("returns null when neither a DB connection nor env config exists", async () => {
    expect(await resolveSsoConfig(orgId)).toBeNull();
    expect(await resolveSsoConfig(null)).toBeNull();
  });
});

describe("resolveProviderConfig", () => {
  it("uses the sole enabled DB connection when no env config is set", async () => {
    await upsertConnection(orgId, {
      issuer: "https://only-idp",
      clientId: "only-cid",
      clientSecret: "only-sec",
    });
    const cfg = await resolveProviderConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.orgId).toBe(orgId);
    expect(cfg!.issuer).toBe("https://only-idp");
    expect(cfg!.clientSecret).toBe("only-sec");
  });

  it("returns null when multiple enabled connections exist (ambiguous)", async () => {
    const orgB = await prisma.organization.create({
      data: { name: "SSO-B-" + Date.now() },
    });
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "s1",
    });
    await upsertConnection(orgB.id, {
      issuer: "https://b",
      clientId: "c2",
      clientSecret: "s2",
    });
    expect(await resolveProviderConfig()).toBeNull();
  });

  it("prefers env config over DB connections", async () => {
    process.env.SSO_OIDC_ISSUER = "https://env-idp";
    process.env.SSO_OIDC_CLIENT_ID = "env-cid";
    process.env.SSO_OIDC_CLIENT_SECRET = "env-sec";
    process.env.SSO_OIDC_ORG_ID = orgId;
    await upsertConnection(orgId, {
      issuer: "https://db",
      clientId: "db-cid",
      clientSecret: "db-sec",
    });
    const cfg = await resolveProviderConfig();
    expect(cfg!.issuer).toBe("https://env-idp");
  });
});

describe("isSsoAvailable", () => {
  it("is true when a DB connection exists even with no env config", async () => {
    await upsertConnection(orgId, {
      issuer: "https://a",
      clientId: "c1",
      clientSecret: "s1",
    });
    expect(await isSsoAvailable()).toBe(true);
    expect(await isSsoAvailable(orgId)).toBe(true);
  });

  it("is false when neither a connection nor env config exists", async () => {
    expect(await isSsoAvailable()).toBe(false);
    expect(await isSsoAvailable(orgId)).toBe(false);
  });
});
