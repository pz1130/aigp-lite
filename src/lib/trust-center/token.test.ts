import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  generateTrustToken,
  verifyTrustToken,
  loadActiveTrustToken,
  touchTrustToken,
} from "./token";

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name:
        "TRUST-TOK-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `trust-tok-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      name: "Trust Tester",
    },
  });
}

async function makeToken(overrides: Record<string, unknown> = {}) {
  const org = await makeOrg();
  const user = await makeUser();
  const { raw, hash, prefix } = generateTrustToken();
  const row = await prisma.trustAccessToken.create({
    data: {
      orgId: org.id,
      tokenHash: hash,
      tokenPrefix: prefix,
      label: "Acme due diligence",
      createdById: user.id,
      ...overrides,
    },
  });
  return { org, user, raw, row };
}

describe("generateTrustToken", () => {
  it("returns a raw token prefixed with aigp_trust_, plus hash and prefix", () => {
    const { raw, hash, prefix } = generateTrustToken();
    expect(raw.startsWith("aigp_trust_")).toBe(true);
    expect(hash).toHaveLength(64);
    expect(raw.startsWith(prefix)).toBe(true);
  });

  it("generates a distinct token on each call", () => {
    expect(generateTrustToken().raw).not.toBe(generateTrustToken().raw);
  });
});

describe("verifyTrustToken", () => {
  it("returns null for a token without the trust prefix", async () => {
    expect(await verifyTrustToken("aigp_scim_nope")).toBeNull();
  });

  it("returns null when no row matches the hash", async () => {
    expect(await verifyTrustToken(generateTrustToken().raw)).toBeNull();
  });

  it("returns the org, id, prefix and label for a live token", async () => {
    const { org, raw, row } = await makeToken();
    expect(await verifyTrustToken(raw)).toEqual({
      id: row.id,
      orgId: org.id,
      tokenPrefix: row.tokenPrefix,
      label: "Acme due diligence",
    });
  });

  it("returns null once the token is revoked", async () => {
    const { raw, row } = await makeToken();
    await prisma.trustAccessToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    expect(await verifyTrustToken(raw)).toBeNull();
  });

  it("returns null once the token has expired", async () => {
    const { raw } = await makeToken({ expiresAt: new Date(Date.now() - 1000) });
    expect(await verifyTrustToken(raw)).toBeNull();
  });

  it("accepts a token whose expiry is still in the future", async () => {
    const { raw } = await makeToken({
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await verifyTrustToken(raw)).not.toBeNull();
  });
});

describe("loadActiveTrustToken", () => {
  it("returns the token by id while live and null after revocation", async () => {
    const { row } = await makeToken();
    expect(await loadActiveTrustToken(row.id)).not.toBeNull();
    await prisma.trustAccessToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    expect(await loadActiveTrustToken(row.id)).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    expect(await loadActiveTrustToken("does-not-exist")).toBeNull();
  });
});

describe("touchTrustToken", () => {
  it("increments useCount and stamps lastUsedAt", async () => {
    const { row } = await makeToken();
    await touchTrustToken(row.id);
    await touchTrustToken(row.id);
    const after = await prisma.trustAccessToken.findUnique({
      where: { id: row.id },
    });
    expect(after?.useCount).toBe(2);
    expect(after?.lastUsedAt).not.toBeNull();
  });
});
