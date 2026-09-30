import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createApiKey, verifyApiKey } from "./manage";

let orgId: string;
beforeAll(async () => {
  await prisma.apiKey.deleteMany();
  await prisma.organization.deleteMany();
  const o = await prisma.organization.create({ data: { name: "ApiOrg" } });
  orgId = o.id;
});
afterAll(async () => {
  await prisma.apiKey.deleteMany();
  await prisma.organization.deleteMany();
});

describe("api-key", () => {
  it("createApiKey returns plaintext key once + stores hash", async () => {
    const { key, prefix, id } = await createApiKey({ orgId, label: "demo" });
    expect(key).toMatch(/^aigp_[A-Za-z0-9_-]{20,}/);
    expect(prefix).toBe(key.slice(0, 8));
    const row = await prisma.apiKey.findUnique({ where: { id } });
    expect(row?.hash).toBeTruthy();
    expect(row?.hash).not.toContain(key);
  });

  it("verifyApiKey returns the orgId for a valid key", async () => {
    const { key } = await createApiKey({ orgId, label: "x" });
    const r = await verifyApiKey(key);
    expect(r?.orgId).toBe(orgId);
  });

  it("verifyApiKey returns null for an invalid key", async () => {
    expect(await verifyApiKey("aigp_garbage")).toBe(null);
  });

  it("verifyApiKey updates lastUsedAt", async () => {
    // Fresh key created in this test — if org was touched by prior test's cleanup the FK may fail
    const freshOrg = await prisma.organization.create({
      data: { name: "ApiKeyFreshOrg" },
    });
    const { key, id } = await createApiKey({ orgId: freshOrg.id, label: "y" });
    await verifyApiKey(key);
    const row = await prisma.apiKey.findUnique({ where: { id } });
    expect(row?.lastUsedAt).not.toBeNull();
    await prisma.organization.delete({ where: { id: freshOrg.id } });
  });
});
