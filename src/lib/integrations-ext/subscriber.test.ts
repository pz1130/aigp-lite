// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { dispatchOutbound } from "./subscriber";
import { encryptJson } from "@/lib/crypto/secrets";

vi.mock("@/lib/egress/guard", () => ({
  assertSafeUrl: vi.fn((url: string) => new URL(url)),
  assertSafeDestination: vi.fn(async (url: string) => new URL(url)),
  assertSafeHost: vi.fn(async () => undefined),
  // Delegate to the *global* fetch at call time so vi.stubGlobal("fetch")
  // stubs are honored; init passes through untouched so exact-init
  // assertions stay green.
  safeFetch: (url: string, init?: RequestInit) => fetch(url, init),
  isBlockedIp: vi.fn(() => false),
  parseAllowlist: vi.fn(),
  EgressBlockedError: class EgressBlockedError extends Error {},
}));

const ORG = "org-m11-sub";

beforeEach(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "M11 Sub Test Org" },
  });
  await prisma.enterpriseIntegration.deleteMany({ where: { orgId: ORG } });
});

afterEach(async () => {
  await prisma.integrationSyncLog.deleteMany({
    where: { integration: { orgId: ORG } },
  });
  await prisma.enterpriseIntegration.deleteMany({ where: { orgId: ORG } });
});

describe("dispatchOutbound", () => {
  it("delivers to integrations subscribed to the event type", async () => {
    await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "slack-on",
        integrationType: "slack_webhook",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ webhookUrl: "http://localhost:4010/slack-ok" }),
        ),
        subscribedEvents: ["incident.created"],
        createdBy: "u",
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await dispatchOutbound({
      type: "incident.created",
      orgId: ORG,
      resourceType: "incident",
      resourceId: "x",
      payload: { id: "x", title: "t", severity: "high", status: "open" },
      occurredAt: new Date(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const logs = await prisma.integrationSyncLog.findMany({
      where: { integration: { orgId: ORG } },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("ok");
    expect(logs[0].direction).toBe("outbound");
  });

  it("skips integrations that don't subscribe to the event", async () => {
    await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "slack-off",
        integrationType: "slack_webhook",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ webhookUrl: "http://localhost:4010/slack" }),
        ),
        subscribedEvents: ["policy.blocked"],
        createdBy: "u",
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await dispatchOutbound({
      type: "incident.created",
      orgId: ORG,
      resourceType: "incident",
      resourceId: "x",
      payload: { id: "x", title: "t", severity: "high" },
      occurredAt: new Date(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs failure when adapter throws and marks healthStatus", async () => {
    const row = await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "slack-down",
        integrationType: "slack_webhook",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ webhookUrl: "http://localhost:4010/down" }),
        ),
        subscribedEvents: ["incident.created"],
        createdBy: "u",
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("upstream 503", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchOutbound({
      type: "incident.created",
      orgId: ORG,
      resourceType: "incident",
      resourceId: "x",
      payload: { id: "x", title: "t", severity: "high" },
      occurredAt: new Date(),
    });

    const logs = await prisma.integrationSyncLog.findMany({
      where: { integrationId: row.id },
    });
    expect(logs[0].status).toBe("failed");

    const refreshed = await prisma.enterpriseIntegration.findUnique({
      where: { id: row.id },
    });
    expect(refreshed?.healthStatus?.startsWith("failed")).toBe(true);
  }, 30_000);

  it("skips inactive integrations", async () => {
    await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "slack-disabled",
        integrationType: "slack_webhook",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ webhookUrl: "http://localhost:4010/slack" }),
        ),
        subscribedEvents: ["incident.created"],
        isActive: false,
        createdBy: "u",
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await dispatchOutbound({
      type: "incident.created",
      orgId: ORG,
      resourceType: "incident",
      resourceId: "x",
      payload: { id: "x", title: "t", severity: "high" },
      occurredAt: new Date(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
