import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { forwardToSink, toForwardSink, type AuditPayload } from "./forward";
import { EgressBlockedError } from "@/lib/egress/guard";

const payload: AuditPayload = {
  ts: "2026-07-03T00:00:00.000Z",
  orgId: "org1",
  action: "test.action",
  resourceType: "test",
};

describe("forwardToSink egress guard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers webhook to a public literal-IP destination", async () => {
    await forwardToSink(
      { type: "webhook", id: "s1", url: "http://93.184.216.34/hec" },
      payload,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks webhook delivery to a private destination without calling fetch", async () => {
    await expect(
      forwardToSink(
        { type: "webhook", id: "s1", url: "http://10.0.0.1/hec" },
        payload,
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks datadog delivery to a private custom intake URL", async () => {
    await expect(
      forwardToSink(
        { type: "datadog", id: "s2", url: "http://192.168.0.10/api/v2/logs" },
        payload,
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks syslog delivery to a private host before opening a socket", async () => {
    await expect(
      forwardToSink(
        {
          type: "syslog",
          id: "s3",
          host: "169.254.169.254",
          port: 514,
          protocol: "udp",
        },
        payload,
      ),
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });
});

describe("toForwardSink", () => {
  it("normalizes valid persisted sink records", () => {
    expect(
      toForwardSink({
        type: "webhook",
        id: "webhook-1",
        url: "https://example.com/hec",
        token: "token",
      }),
    ).toEqual({
      type: "webhook",
      id: "webhook-1",
      url: "https://example.com/hec",
      token: "token",
    });
    expect(
      toForwardSink({
        type: "syslog",
        id: "syslog-1",
        host: "logs.example.com",
        port: 514,
        protocol: null,
      }),
    ).toEqual({
      type: "syslog",
      id: "syslog-1",
      host: "logs.example.com",
      port: 514,
      protocol: "udp",
    });
    expect(
      toForwardSink({ type: "datadog", id: "datadog-1", apiKey: "key" }),
    ).toEqual({
      type: "datadog",
      id: "datadog-1",
      url: undefined,
      apiKey: "key",
    });
  });

  it("rejects incomplete or unknown persisted records", () => {
    expect(toForwardSink({ type: "webhook", id: "missing-url" })).toBeNull();
    expect(
      toForwardSink({
        type: "syslog",
        id: "missing-port",
        host: "example.com",
      }),
    ).toBeNull();
    expect(
      toForwardSink({
        type: "syslog",
        id: "bad-protocol",
        host: "example.com",
        port: 514,
        protocol: "http",
      }),
    ).toBeNull();
    expect(toForwardSink({ type: "unknown", id: "unknown-1" })).toBeNull();
  });
});
