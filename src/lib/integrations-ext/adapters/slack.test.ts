import { describe, it, expect, vi } from "vitest";
import { slackAdapter } from "./slack";
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
  integrationType: "slack_webhook",
} as EnterpriseIntegration;
const creds = { webhookUrl: "https://hooks.slack.com/services/X/Y/Z" };

function mockOk() {
  return vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
}

describe("slack adapter", () => {
  it("posts an incident.created card to the configured URL", async () => {
    const fetchMock = mockOk();
    vi.stubGlobal("fetch", fetchMock);
    const r = await slackAdapter.send(
      integ,
      {
        type: "incident.created",
        orgId: "o",
        resourceType: "incident",
        resourceId: "inc1",
        payload: {
          title: "Policy violation: PII leak",
          severity: "high",
          id: "inc1",
          status: "open",
        },
        occurredAt: new Date(),
      },
      creds,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/X/Y/Z",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.text).toContain("Policy violation");
    expect(body.text).toContain("HIGH");
    expect(r.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("formats budget threshold events", async () => {
    const fetchMock = mockOk();
    vi.stubGlobal("fetch", fetchMock);
    await slackAdapter.send(
      integ,
      {
        type: "budget.threshold.exceeded",
        orgId: "o",
        resourceType: "budget",
        resourceId: "b1",
        payload: {
          threshold: 80,
          scope: "org",
          period: "2026-05",
          amountUsd: 240,
        },
        occurredAt: new Date(),
      },
      creds,
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.text).toContain("80%");
  });

  it("falls back to generic event for unknown types", async () => {
    const fetchMock = mockOk();
    vi.stubGlobal("fetch", fetchMock);
    await slackAdapter.send(
      integ,
      {
        type: "custom.weird.event",
        orgId: "o",
        resourceType: "x",
        resourceId: "y",
        payload: {},
        occurredAt: new Date(),
      },
      creds,
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.text).toContain("custom.weird.event");
  });
});
