// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { integrationsExtRouter } from "./router";
import { decryptJson } from "@/lib/crypto/secrets";
import type { TRPCContext } from "@/lib/trpc/server";

// Creation-time egress guard resolves hostnames; pin DNS to a public IP so
// hooks.slack.com / *.service-now.com fixtures don't hit the network.
vi.mock("node:dns/promises", () => {
  const lookup = vi
    .fn()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  return { default: { lookup }, lookup };
});

const ORG_A = "m11-rt-A";
const ORG_B = "m11-rt-B";

let ctxAdmin: TRPCContext;
let ctxOwner: TRPCContext;
let ctxViewer: TRPCContext;
let ctxB: TRPCContext;
const userIds: string[] = [];

beforeAll(async () => {
  const pwd = await hashPassword("testtest");
  const uAdmin = await prisma.user.upsert({
    where: { email: "m11-admin@t" },
    update: {},
    create: { email: "m11-admin@t", name: "Adm", passwordHash: pwd },
  });
  const uOwner = await prisma.user.upsert({
    where: { email: "m11-owner@t" },
    update: {},
    create: { email: "m11-owner@t", name: "Own", passwordHash: pwd },
  });
  const uView = await prisma.user.upsert({
    where: { email: "m11-viewer@t" },
    update: {},
    create: { email: "m11-viewer@t", name: "Vw", passwordHash: pwd },
  });
  const uB = await prisma.user.upsert({
    where: { email: "m11-b@t" },
    update: {},
    create: { email: "m11-b@t", name: "B", passwordHash: pwd },
  });
  userIds.push(uAdmin.id, uOwner.id, uView.id, uB.id);

  await prisma.organization.upsert({
    where: { id: ORG_A },
    update: {},
    create: { id: ORG_A, name: "M11 Router A" },
  });
  await prisma.organization.upsert({
    where: { id: ORG_B },
    update: {},
    create: { id: ORG_B, name: "M11 Router B" },
  });

  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_A, userId: uAdmin.id } },
    update: {},
    create: { orgId: ORG_A, userId: uAdmin.id, role: "admin" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_A, userId: uOwner.id } },
    update: {},
    create: { orgId: ORG_A, userId: uOwner.id, role: "ai_owner" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_A, userId: uView.id } },
    update: {},
    create: { orgId: ORG_A, userId: uView.id, role: "viewer" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: ORG_B, userId: uB.id } },
    update: {},
    create: { orgId: ORG_B, userId: uB.id, role: "admin" },
  });

  ctxAdmin = {
    session: {
      userId: uAdmin.id,
      email: uAdmin.email,
      orgId: ORG_A,
      role: "admin",
    },
  } as never;
  ctxOwner = {
    session: {
      userId: uOwner.id,
      email: uOwner.email,
      orgId: ORG_A,
      role: "ai_owner",
    },
  } as never;
  ctxViewer = {
    session: {
      userId: uView.id,
      email: uView.email,
      orgId: ORG_A,
      role: "viewer",
    },
  } as never;
  ctxB = {
    session: { userId: uB.id, email: uB.email, orgId: ORG_B, role: "admin" },
  } as never;
});

afterAll(async () => {
  await prisma.integrationSyncLog.deleteMany({
    where: { integration: { orgId: { in: [ORG_A, ORG_B] } } },
  });
  await prisma.enterpriseIntegration.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_A, ORG_B] } },
  });
});

beforeEach(async () => {
  await prisma.enterpriseIntegration.deleteMany({
    where: { orgId: { in: [ORG_A, ORG_B] } },
  });
});

describe("integrationsExt.create", () => {
  it("admin creates slack integration and inboundSecret stays null", async () => {
    const caller = integrationsExtRouter.createCaller(ctxAdmin as never);
    const out = await caller.create({
      integrationType: "slack_webhook",
      name: "slack-1",
      credentials: { webhookUrl: "https://hooks.slack.com/x" },
      config: {},
      subscribedEvents: ["incident.created"],
    });
    expect(out.name).toBe("slack-1");
    expect(out.inboundSecret).toBeNull();

    const row = await prisma.enterpriseIntegration.findFirst({
      where: { id: out.id },
    });
    expect(row?.credentialsEncrypted.byteLength).toBeGreaterThan(0);
    const creds = decryptJson<Record<string, string>>(
      row!.credentialsEncrypted,
    );
    expect(creds.webhookUrl).toBe("https://hooks.slack.com/x");
  });

  it("returns inboundSecret in plaintext exactly once for servicenow", async () => {
    const caller = integrationsExtRouter.createCaller(ctxAdmin as never);
    const out = await caller.create({
      integrationType: "servicenow",
      name: "sn-1",
      credentials: { username: "u", password: "p" },
      config: { instanceUrl: "https://acme.service-now.com" },
      subscribedEvents: [],
    });
    expect(out.inboundSecret).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const fetched = await caller.get({ id: out.id });
    expect(fetched.inboundSecret).toBe("•••");
  });

  it("ai_owner can create — viewer cannot (RBAC)", async () => {
    const ownerCaller = integrationsExtRouter.createCaller(ctxOwner as never);
    const viewerCaller = integrationsExtRouter.createCaller(ctxViewer as never);

    await expect(
      ownerCaller.create({
        integrationType: "slack_webhook",
        name: "owner-slack",
        credentials: { webhookUrl: "https://hooks.slack.com/x" },
        config: {},
        subscribedEvents: [],
      }),
    ).resolves.toBeDefined();

    await expect(
      viewerCaller.create({
        integrationType: "slack_webhook",
        name: "viewer-slack",
        credentials: { webhookUrl: "https://hooks.slack.com/x" },
        config: {},
        subscribedEvents: [],
      }),
    ).rejects.toThrow(/integrations\.write/);
  });

  it("rejects creation when a required cred field is missing", async () => {
    const caller = integrationsExtRouter.createCaller(ctxAdmin as never);
    await expect(
      caller.create({
        integrationType: "servicenow",
        name: "sn-bad",
        credentials: { username: "u" }, // password missing
        config: { instanceUrl: "https://x.service-now.com" },
        subscribedEvents: [],
      }),
    ).rejects.toThrow(/credential password required/);
  });
});

describe("integrationsExt cross-tenant isolation", () => {
  it("list and get do not leak rows from another org", async () => {
    const callerA = integrationsExtRouter.createCaller(ctxAdmin as never);
    const callerB = integrationsExtRouter.createCaller(ctxB as never);

    const a = await callerA.create({
      integrationType: "slack_webhook",
      name: "a-only",
      credentials: { webhookUrl: "https://hooks.slack.com/x" },
      config: {},
      subscribedEvents: [],
    });

    expect((await callerB.list()).map((r) => r.id)).not.toContain(a.id);
    await expect(callerB.get({ id: a.id })).rejects.toThrow(/NOT_FOUND/);
  });
});

describe("integrationsExt.delete", () => {
  it("admin can delete, ai_owner cannot", async () => {
    const adminCaller = integrationsExtRouter.createCaller(ctxAdmin as never);
    const ownerCaller = integrationsExtRouter.createCaller(ctxOwner as never);
    const row = await adminCaller.create({
      integrationType: "slack_webhook",
      name: "to-delete",
      credentials: { webhookUrl: "https://hooks.slack.com/x" },
      config: {},
      subscribedEvents: [],
    });
    await expect(ownerCaller.delete({ id: row.id })).rejects.toThrow(
      /integrations\.delete/,
    );
    await expect(adminCaller.delete({ id: row.id })).resolves.toEqual({
      ok: true,
    });
  });
});

describe("integrationsExt.test", () => {
  it("dispatches an integration.test event through the registered adapter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const caller = integrationsExtRouter.createCaller(ctxAdmin as never);
    const row = await caller.create({
      integrationType: "slack_webhook",
      name: "test-target",
      credentials: { webhookUrl: "https://hooks.slack.com/test" },
      config: {},
      subscribedEvents: ["integration.test"],
    });
    const r = await caller.test({ id: row.id });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("integrations-ext egress guard at create", () => {
  it("rejects a slack integration pointing at the cloud metadata endpoint", async () => {
    const caller = integrationsExtRouter.createCaller(ctxAdmin as never);
    await expect(
      caller.create({
        integrationType: "slack_webhook",
        name: "evil",
        credentials: { webhookUrl: "http://169.254.169.254/" },
        config: {},
        subscribedEvents: ["incident.created"],
      }),
    ).rejects.toThrow(/Egress blocked/);
  });

  it("rejects a servicenow integration with a private instanceUrl", async () => {
    const caller = integrationsExtRouter.createCaller(ctxAdmin as never);
    await expect(
      caller.create({
        integrationType: "servicenow",
        name: "evil-snow",
        credentials: { username: "u", password: "p" },
        config: { instanceUrl: "http://10.0.0.8" },
        subscribedEvents: ["incident.created"],
      }),
    ).rejects.toThrow(/AIGP_EGRESS_ALLOWLIST/);
  });
});
