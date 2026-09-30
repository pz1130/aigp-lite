import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { generateScimToken, verifyScimToken } from "./token";

async function makeOrg() {
  return prisma.organization.create({
    data: {
      name:
        "SCIM-TOK-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    },
  });
}

describe("generateScimToken", () => {
  it("returns a raw token prefixed with aigp_scim_, plus hash and prefix", () => {
    const { raw, hash, prefix } = generateScimToken();
    expect(raw.startsWith("aigp_scim_")).toBe(true);
    expect(hash).toHaveLength(64);
    expect(raw.startsWith(prefix)).toBe(true);
  });

  it("generates a distinct token on each call", () => {
    const a = generateScimToken();
    const b = generateScimToken();
    expect(a.raw).not.toBe(b.raw);
  });
});

describe("verifyScimToken", () => {
  it("returns null for a token that doesn't start with aigp_scim_", async () => {
    expect(await verifyScimToken("aigp_wrong_prefix")).toBeNull();
  });

  it("returns null when no connection matches the hash", async () => {
    const { raw } = generateScimToken();
    expect(await verifyScimToken(raw)).toBeNull();
  });

  it("returns the org and connection id for a valid enabled token", async () => {
    const org = await makeOrg();
    const { raw, hash, prefix } = generateScimToken();
    const conn = await prisma.scimConnection.create({
      data: {
        orgId: org.id,
        tokenHash: hash,
        tokenPrefix: prefix,
        createdBy: "tester",
      },
    });
    const result = await verifyScimToken(raw);
    expect(result).toEqual({ orgId: org.id, connectionId: conn.id });
  });

  it("returns null when the connection is disabled", async () => {
    const org = await makeOrg();
    const { raw, hash, prefix } = generateScimToken();
    await prisma.scimConnection.create({
      data: {
        orgId: org.id,
        tokenHash: hash,
        tokenPrefix: prefix,
        enabled: false,
        createdBy: "tester",
      },
    });
    expect(await verifyScimToken(raw)).toBeNull();
  });
});
