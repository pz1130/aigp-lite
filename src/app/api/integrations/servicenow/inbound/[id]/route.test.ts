// @vitest-environment node
// jsdom swaps the global Uint8Array for its own realm's, which breaks Prisma 7's
// Bytes handling (instanceof checks reject Node Buffers); these tests are server-only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { POST } from "./route";
import { encryptJson } from "@/lib/crypto/secrets";

const ORG = "org-m11-inb";

function makeReq(id: string, body: unknown, secret?: string): NextRequest {
  return new Request(`http://x/api/integrations/servicenow/inbound/${id}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(async () => {
  await prisma.organization.upsert({
    where: { id: ORG },
    update: {},
    create: { id: ORG, name: "Inbound Test Org" },
  });
  await prisma.integrationSyncLog.deleteMany({
    where: { integration: { orgId: ORG } },
  });
  await prisma.enterpriseIntegration.deleteMany({ where: { orgId: ORG } });
});

afterEach(async () => {
  await prisma.integrationSyncLog.deleteMany({
    where: { integration: { orgId: ORG } },
  });
  await prisma.enterpriseIntegration.deleteMany({ where: { orgId: ORG } });
});

describe("ServiceNow inbound route", () => {
  it("401 when the webhook secret header is wrong", async () => {
    const i = await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "sn",
        integrationType: "servicenow",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ username: "u", password: "p" }),
        ),
        subscribedEvents: [],
        inboundSecret: "good-secret",
        createdBy: "u",
      },
    });
    const r = await POST(makeReq(i.id, {}, "wrong"), {
      params: Promise.resolve({ id: i.id }),
    });
    expect(r.status).toBe(401);
  });

  it("410 when integration is inactive", async () => {
    const i = await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "sn",
        integrationType: "servicenow",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ username: "u", password: "p" }),
        ),
        subscribedEvents: [],
        inboundSecret: "s",
        isActive: false,
        createdBy: "u",
      },
    });
    const r = await POST(makeReq(i.id, {}, "s"), {
      params: Promise.resolve({ id: i.id }),
    });
    expect(r.status).toBe(410);
  });

  it("200 + action=not_found for unmapped incident", async () => {
    const i = await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "sn",
        integrationType: "servicenow",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ username: "u", password: "p" }),
        ),
        subscribedEvents: [],
        inboundSecret: "s",
        createdBy: "u",
      },
    });
    const r = await POST(
      makeReq(i.id, { u_aigp_incident_id: "nope", state: "6" }, "s"),
      { params: Promise.resolve({ id: i.id }) },
    );
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.action).toBe("not_found");

    const logs = await prisma.integrationSyncLog.findMany({
      where: { integrationId: i.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].direction).toBe("inbound");
    expect(logs[0].status).toBe("not_found");
  });

  it("400 when the body is not valid JSON", async () => {
    const i = await prisma.enterpriseIntegration.create({
      data: {
        orgId: ORG,
        name: "sn",
        integrationType: "servicenow",
        credentialsEncrypted: new Uint8Array(
          encryptJson({ username: "u", password: "p" }),
        ),
        subscribedEvents: [],
        inboundSecret: "s",
        createdBy: "u",
      },
    });
    const req = new Request(
      `http://x/api/integrations/servicenow/inbound/${i.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-secret": "s",
        },
        body: "not-json",
      },
    ) as unknown as NextRequest;
    const r = await POST(req, { params: Promise.resolve({ id: i.id }) });
    expect(r.status).toBe(400);
  });
});
