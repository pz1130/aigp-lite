import { describe, it, expect, vi, beforeEach } from "vitest";
import { canonicalizeIncidentSync, serviceNowAdapter } from "./servicenow";
import type { EnterpriseIntegration } from "@/lib/prisma";

vi.mock("@/lib/db", () => ({
  prisma: {
    incident: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

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

const integ = {
  id: "i",
  integrationType: "servicenow",
  config: { instanceUrl: "https://acme.service-now.com" },
} as unknown as EnterpriseIntegration;
const creds = { username: "u", password: "p" };

function mockSnowCreated() {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ result: { number: "INC0010042", sys_id: "abc123" } }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
}

describe("servicenow outbound", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs to /api/now/table/incident with mapped fields + basic auth", async () => {
    const fetchMock = mockSnowCreated();
    vi.stubGlobal("fetch", fetchMock);

    const r = await serviceNowAdapter.send(
      integ,
      {
        type: "incident.created",
        orgId: "o",
        resourceType: "incident",
        resourceId: "inc1",
        payload: {
          id: "inc1",
          title: "PII leak",
          severity: "high",
          status: "open",
        },
        occurredAt: new Date(),
      },
      creds,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://acme.service-now.com/api/now/table/incident",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const authorization = new Headers(init.headers).get("authorization");
    expect(authorization).toMatch(/^Basic /);
    expect(Buffer.from(authorization!.slice(6), "base64").toString()).toBe(
      "u:p",
    );
    const body = JSON.parse(String(init.body));
    expect(body.short_description).toBe("PII leak");
    expect(body.urgency).toBe("2");
    expect(body.state).toBe("1");
    expect(body.u_aigp_incident_id).toBe("inc1");

    expect(r.externalRef).toBe("INC0010042");
    expect(r.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("throws when config.instanceUrl is missing", async () => {
    vi.stubGlobal("fetch", mockSnowCreated());
    const broken = { ...integ, config: {} } as EnterpriseIntegration;
    await expect(
      serviceNowAdapter.send(
        broken,
        {
          type: "incident.created",
          orgId: "o",
          resourceType: "incident",
          resourceId: "x",
          payload: { id: "x", title: "y", severity: "low", status: "open" },
          occurredAt: new Date(),
        },
        creds,
      ),
    ).rejects.toThrow(/instanceUrl missing/);
  });

  it("returns a hash for non-incident events without calling SNow", async () => {
    const fetchMock = mockSnowCreated();
    vi.stubGlobal("fetch", fetchMock);
    const r = await serviceNowAdapter.send(
      integ,
      {
        type: "budget.threshold.exceeded",
        orgId: "o",
        resourceType: "budget",
        resourceId: "b1",
        payload: {},
        occurredAt: new Date(),
      },
      creds,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("servicenow inbound", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns action=not_found when no incident matches", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const r = await serviceNowAdapter.applyInbound!(
      integ,
      {
        sys_id: "x",
        number: "INC1",
        state: "6",
        short_description: "y",
        u_aigp_incident_id: "nope",
      },
      creds,
    );
    expect(r.action).toBe("not_found");
  });

  it("returns action=updated and updates local status when hash differs", async () => {
    const { prisma } = await import("@/lib/db");
    const findMock = prisma.incident.findFirst as ReturnType<typeof vi.fn>;
    const updateMock = prisma.incident.update as ReturnType<typeof vi.fn>;
    findMock.mockResolvedValue({
      id: "inc1",
      orgId: "o",
      status: "open",
      externalRefs: {
        [integ.id]: {
          lastSyncHash: "stale-hash",
          sysId: "abc123",
          ticketNumber: "INC0010042",
        },
      },
    });
    updateMock.mockResolvedValue({});

    const payload = {
      sys_id: "abc123",
      number: "INC0010042",
      state: "6",
      short_description: "PII leak",
      u_aigp_incident_id: "inc1",
    };
    const r = await serviceNowAdapter.applyInbound!(
      { ...integ, orgId: "o" } as EnterpriseIntegration,
      payload,
      creds,
    );
    expect(r.action).toBe("updated");
    expect(r.resourceId).toBe("inc1");
    const callArgs = updateMock.mock.calls[0][0];
    expect(callArgs.data.status).toBe("closed");
    expect(callArgs.data.externalRefs[integ.id].lastSyncHash).toBe(
      r.payloadHash,
    );
  });

  it("returns action=skipped_echo when payload hash matches lastSyncHash", async () => {
    const { prisma } = await import("@/lib/db");
    const payload = {
      sys_id: "abc123",
      number: "INC0010042",
      state: "1",
      short_description: "PII leak",
      u_aigp_incident_id: "inc2",
    };
    const sameHash = canonicalizeIncidentSync(payload);
    (prisma.incident.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "inc2",
      orgId: "o",
      status: "open",
      externalRefs: {
        [integ.id]: {
          lastSyncHash: sameHash,
          sysId: "abc123",
          ticketNumber: "INC0010042",
        },
      },
    });
    const updateMock = prisma.incident.update as ReturnType<typeof vi.fn>;
    const r = await serviceNowAdapter.applyInbound!(
      { ...integ, orgId: "o" } as EnterpriseIntegration,
      payload,
      creds,
    );
    expect(r.action).toBe("skipped_echo");
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("canonicalizeIncidentSync", () => {
  it("returns the same hash regardless of key order", () => {
    const a = canonicalizeIncidentSync({
      state: "2",
      short_description: "x",
      u_aigp_incident_id: "id1",
    });
    const b = canonicalizeIncidentSync({
      u_aigp_incident_id: "id1",
      short_description: "x",
      state: "2",
    });
    expect(a).toBe(b);
  });

  it("changes hash when any tracked field changes", () => {
    const a = canonicalizeIncidentSync({
      state: "2",
      short_description: "x",
      u_aigp_incident_id: "id1",
    });
    const b = canonicalizeIncidentSync({
      state: "3",
      short_description: "x",
      u_aigp_incident_id: "id1",
    });
    expect(a).not.toBe(b);
  });
});
