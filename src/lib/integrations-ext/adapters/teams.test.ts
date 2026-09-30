import { describe, it, expect, vi } from "vitest";
import { teamsAdapter } from "./teams";
import type { EnterpriseIntegration } from "@/lib/prisma";

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
  id: "i1",
  integrationType: "teams_webhook",
} as EnterpriseIntegration;
const creds = { webhookUrl: "https://outlook.office.com/webhook/abc" };

function mockOk() {
  return vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
}

describe("teams adapter", () => {
  it("posts a MessageCard for incident events", async () => {
    const fetchMock = mockOk();
    vi.stubGlobal("fetch", fetchMock);
    await teamsAdapter.send(
      integ,
      {
        type: "incident.created",
        orgId: "o",
        resourceType: "incident",
        resourceId: "inc1",
        payload: {
          title: "PII leak",
          severity: "critical",
          id: "inc1",
          status: "open",
        },
        occurredAt: new Date(),
      },
      creds,
    );

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body["@type"]).toBe("MessageCard");
    expect(body["@context"]).toBe("http://schema.org/extensions");
    expect(body.themeColor).toBe("FF0000");
    expect(body.sections[0].activityTitle).toContain("CRITICAL");
  });

  it("colors medium-severity events orange", async () => {
    const fetchMock = mockOk();
    vi.stubGlobal("fetch", fetchMock);
    await teamsAdapter.send(
      integ,
      {
        type: "incident.created",
        orgId: "o",
        resourceType: "incident",
        resourceId: "i2",
        payload: { title: "x", severity: "medium", id: "i2", status: "open" },
        occurredAt: new Date(),
      },
      creds,
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.themeColor).toBe("FFA500");
  });

  it("renders integration.test as reachable check", async () => {
    const fetchMock = mockOk();
    vi.stubGlobal("fetch", fetchMock);
    await teamsAdapter.send(
      integ,
      {
        type: "integration.test",
        orgId: "o",
        resourceType: "integration",
        resourceId: integ.id,
        payload: {},
        occurredAt: new Date(),
      },
      creds,
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.sections[0].activityTitle).toContain("test");
  });
});
