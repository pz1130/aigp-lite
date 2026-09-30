// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";

// Creation-time egress guard resolves hostnames; pin DNS to a public IP so
// example.com fixtures don't hit the network.
vi.mock("node:dns/promises", () => {
  const lookup = vi
    .fn()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  return { default: { lookup }, lookup };
});

let orgId: string;
let userId: string;

function makeCaller() {
  return appRouter.createCaller({
    session: { userId, orgId, role: "admin", email: "iwr@x" },
    ip: "127.0.0.1",
  } as unknown as TRPCContext).integrations;
}

beforeAll(async () => {
  const o = await prisma.organization.create({
    data: { name: `IWR ${Date.now()}` },
  });
  orgId = o.id;
  const u = await prisma.user.create({
    data: { email: `iwr-${Date.now()}@x`, name: "IWR", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.create({ data: { orgId, userId, role: "admin" } });
});

afterAll(async () => {
  await prisma.webhookEndpoint.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

describe("integrations webhook egress guard", () => {
  it("creates a webhook for a public destination", async () => {
    const created = await makeCaller().createWebhook({
      url: "https://hooks.example.com/aigp",
    });
    expect(created.url).toBe("https://hooks.example.com/aigp");
    expect(created.secret).toMatch(/^wh_/);
  });

  it("rejects createWebhook pointing at a private destination", async () => {
    await expect(
      makeCaller().createWebhook({ url: "http://192.168.1.1/hook" }),
    ).rejects.toThrow(/Egress blocked/);
  });

  it("rejects updateWebhook pointing at the cloud metadata endpoint", async () => {
    const created = await makeCaller().createWebhook({
      url: "https://hooks.example.com/aigp2",
    });
    await expect(
      makeCaller().updateWebhook({
        id: created.id,
        url: "http://169.254.169.254/latest/meta-data",
      }),
    ).rejects.toThrow(/AIGP_EGRESS_ALLOWLIST/);
  });
});
