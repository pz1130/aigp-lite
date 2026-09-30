import { describe, it, expect, vi } from "vitest";
import { runProxy, type ProxyEvent } from "./proxy";

vi.mock("./providers/registry", () => {
  return {
    getAdapter: () => ({
      async *streamChat() {
        yield { delta: "hello", done: false };
        yield { delta: "", done: true, usage: { input: 1, output: 1 } };
      },
      async ping() {
        return { ok: true, latencyMs: 1 };
      },
    }),
    getReliableAdapter: () => ({
      async *streamChat() {
        yield { delta: "hello", done: false };
        yield { delta: "", done: true, usage: { input: 1, output: 1 } };
      },
      async ping() {
        return { ok: true, latencyMs: 1 };
      },
    }),
  };
});

const policies = [
  {
    id: "p1",
    name: "input-block",
    ruleJson: { contains_any: [{ var: "text" }, ["badword"]] },
    enforcementMode: "block" as const,
    scope: "both" as const,
    severity: "high" as const,
  },
];

describe("runProxy", () => {
  it("blocks at input", async () => {
    const events: ProxyEvent[] = [];
    for await (const e of runProxy({
      connection: {
        providerType: "openai",
        baseUrl: "x",
        credentials: { apiKey: "k" },
        config: {},
      },
      model: "m",
      messages: [{ role: "user", content: "this has badword" }],
      policies,
      evalCtxBase: {},
    }))
      events.push(e);
    expect(events[0].type).toBe("blocked");
  });

  it("streams chunks then done", async () => {
    const events: ProxyEvent[] = [];
    for await (const e of runProxy({
      connection: {
        providerType: "openai",
        baseUrl: "x",
        credentials: { apiKey: "k" },
        config: {},
      },
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      policies: [],
      evalCtxBase: {},
    }))
      events.push(e);
    expect(
      events
        .filter((e) => e.type === "chunk")
        .map((e) => e.text)
        .join(""),
    ).toBe("hello");
    expect(events.at(-1)?.type).toBe("done");
  });
});
