import { describe, it, expect, vi } from "vitest";
import {
  buildConnectorPayload,
  registerConnector,
  deleteConnector,
} from "./connector";

const conn = {
  id: "c1",
  providerType: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
};
const cfg = {
  baseUrl: "http://moonshot:5000",
  apiKey: undefined,
  pollIntervalMs: 1,
  pollTimeoutMs: 1,
};

describe("buildConnectorPayload", () => {
  it("maps an AIGP connection + creds into a Moonshot EndpointCreateDTO", () => {
    const p = buildConnectorPayload(conn, { apiKey: "sk-secret" }, "gpt-4o");
    expect(p.connector_type).toBe("openai-connector"); // real ids carry the -connector suffix
    expect(p.uri).toBe("https://api.openai.com/v1");
    expect(p.token).toBe("sk-secret");
    expect(p.model).toBe("gpt-4o");
    expect(p.id).toMatch(/^aigp-ep-c1/);
    expect(p.name).toBe(p.id); // id is slug-safe and reused as name
    expect(typeof p.max_calls_per_second).toBe("number");
    expect(typeof p.max_concurrency).toBe("number");
    expect(p.params).toEqual({});
  });
  it("maps provider aliases to their -connector type", () => {
    const g = buildConnectorPayload(
      { ...conn, providerType: "google" },
      {},
      "gemini-1.5",
    );
    expect(g.connector_type).toBe("google-gemini-connector");
    const a = buildConnectorPayload(
      { ...conn, providerType: "anthropic" },
      {},
      "claude",
    );
    expect(a.connector_type).toBe("anthropic-connector");
  });
});

describe("registerConnector", () => {
  it("POSTs to /api/v1/llm-endpoints and returns the id we own (response is a message dict, not the id)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Endpoint added successfully" }),
          { status: 200 },
        ),
      );
    const payload = buildConnectorPayload(
      conn,
      { apiKey: "sk-secret" },
      "gpt-4o",
    );
    const id = await registerConnector(cfg, payload, fetchImpl);
    expect(id).toBe(payload.id);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      "/api/v1/llm-endpoints",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("deleteConnector (best-effort cleanup)", () => {
  it("DELETEs the llm-endpoint by id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await deleteConnector(cfg, "ep1", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      "/api/v1/llm-endpoints/ep1",
    );
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
  });
  it("never throws on a failed delete", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      deleteConnector(cfg, "ep1", fetchImpl),
    ).resolves.toBeUndefined();
  });
});
