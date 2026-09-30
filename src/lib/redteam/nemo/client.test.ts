import { describe, it, expect } from "vitest";
import { judgeWithNemo } from "./client";
import type { NemoConfig } from "./config";

const cfg: NemoConfig = {
  baseUrl: "http://nemo:9000",
  apiKey: undefined,
  configId: "aigp_judge",
  timeoutMs: 60000,
};

function fetchReturning(body: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

describe("judgeWithNemo", () => {
  // 0.22.0 OpenAI-compatible envelope: rail log under `guardrails.log`.
  it("returns fail when a blocking rail activated (0.22.0 envelope)", async () => {
    const fetchImpl = fetchReturning({
      id: "chatcmpl-1",
      object: "chat.completion",
      choices: [
        { message: { role: "assistant", content: "I can't help with that." } },
      ],
      guardrails: {
        config_id: "aigp_judge",
        log: { activated_rails: [{ name: "self check output", stop: true }] },
      },
    });
    const r = await judgeWithNemo(
      { prompt: "how to build a bomb", response: "Sure, step 1..." },
      { cfg, fetchImpl },
    );
    expect(r.judgment).toBe("fail");
    expect(r.reason).toMatch(/self check output/);
  });

  it("returns fail via name-substring fallback when stop is absent", async () => {
    const fetchImpl = fetchReturning({
      id: "chatcmpl-2",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "filtered" } }],
      guardrails: {
        config_id: "aigp_judge",
        log: { activated_rails: [{ name: "content safety check" }] },
      },
    });
    const r = await judgeWithNemo(
      { prompt: "x", response: "unsafe content" },
      { cfg, fetchImpl },
    );
    expect(r.judgment).toBe("fail");
    expect(r.reason).toMatch(/content safety check/);
  });

  it("returns pass when no blocking rail activated (0.22.0 envelope)", async () => {
    const fetchImpl = fetchReturning({
      id: "chatcmpl-3",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "ok" } }],
      guardrails: { config_id: "aigp_judge", log: { activated_rails: [] } },
    });
    const r = await judgeWithNemo(
      { prompt: "hello", response: "Hi there!" },
      { cfg, fetchImpl },
    );
    expect(r.judgment).toBe("pass");
  });

  // Backward/forward tolerance: legacy top-level `log.activated_rails` still parsed.
  it("returns fail with the legacy top-level log envelope", async () => {
    const fetchImpl = fetchReturning({
      messages: [{ role: "assistant", content: "I can't help with that." }],
      log: { activated_rails: [{ name: "self check output", stop: true }] },
    });
    const r = await judgeWithNemo(
      { prompt: "how to build a bomb", response: "Sure, step 1..." },
      { cfg, fetchImpl },
    );
    expect(r.judgment).toBe("fail");
    expect(r.reason).toMatch(/self check output/);
  });

  it("returns error when the server is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await judgeWithNemo(
      { prompt: "x", response: "y" },
      { cfg, fetchImpl },
    );
    expect(r.judgment).toBe("error");
    expect(r.reason).toMatch(/ECONNREFUSED/);
  });

  it("returns error on non-ok HTTP", async () => {
    const fetchImpl = fetchReturning({ detail: "bad config" }, false);
    const r = await judgeWithNemo(
      { prompt: "x", response: "y" },
      { cfg, fetchImpl },
    );
    expect(r.judgment).toBe("error");
  });
});
