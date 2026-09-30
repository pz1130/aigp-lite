import { describe, it, expect, vi } from "vitest";
import { runMoonshotBenchmark } from "./client";

const cfg = {
  baseUrl: "http://moonshot:5000",
  apiKey: undefined,
  pollIntervalMs: 1,
  pollTimeoutMs: 1000,
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const resolveTarget = async () => ({
  conn: {
    id: "c1",
    providerType: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  },
  creds: { apiKey: "sk-x" },
});

// The runner_id = run_name (slug-safe) which the client mints with a timestamp,
// so the mock captures it from the start-call body and keys status/results by it.
describe("runMoonshotBenchmark (async lifecycle)", () => {
  it("registers, starts (?type=recipe), polls status to completion, fetches raw_results, flattens", async () => {
    const calls: string[] = [];
    let runName = "";
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      calls.push(u.pathname);
      if (u.pathname === "/api/v1/llm-endpoints" && init?.method === "POST")
        return jsonRes({ message: "ok" });
      if (u.pathname === "/api/v1/benchmarks") {
        runName = (JSON.parse(String(init?.body)) as { run_name: string })
          .run_name;
        expect(u.searchParams.get("type")).toBe("recipe");
        return jsonRes({ id: runName });
      }
      if (u.pathname === "/api/v1/benchmarks/status")
        return jsonRes({ [runName]: { current_status: "completed" } });
      if (u.pathname === `/api/v1/benchmarks/results/${runName}`)
        return jsonRes({
          metadata: {
            id: runName,
            status: "completed",
            recipes: ["challenging-toxicity-prompts-completion"],
          },
          results: {
            recipes: [
              {
                id: "challenging-toxicity-prompts-completion",
                details: [
                  {
                    data: [
                      {
                        prompt: "x",
                        predicted_result: { response: "no", context: [] },
                        duration: 0.1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });
      throw new Error(`unexpected ${url}`);
    });
    const fetchImpl = mock as unknown as typeof fetch;

    const out = await runMoonshotBenchmark(
      cfg,
      {
        connectionId: "c1",
        model: "gpt-4o",
        recipes: ["builtin:moonshot.toxicity.slur-bait-01"],
        resolveTarget,
      },
      fetchImpl,
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].category).toBe(
      "challenging-toxicity-prompts-completion",
    );
    expect(calls.some((p) => p === "/api/v1/llm-endpoints")).toBe(true);
    expect(calls.some((p) => p === "/api/v1/benchmarks/status")).toBe(true);
    const deleted = mock.mock.calls.some(
      ([u, init]) =>
        String(u).includes("/api/v1/llm-endpoints/aigp-ep-c1") &&
        (init as unknown as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleted).toBe(true);
  });

  it("falls back to the results-name list when the runner is absent from the status dict", async () => {
    let runName = "";
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname === "/api/v1/llm-endpoints" && init?.method === "POST")
        return jsonRes({ message: "ok" });
      if (u.pathname === "/api/v1/benchmarks") {
        runName = (JSON.parse(String(init?.body)) as { run_name: string })
          .run_name;
        return jsonRes({ id: runName });
      }
      if (u.pathname === "/api/v1/benchmarks/status") return jsonRes({}); // finished runner dropped out
      if (u.pathname === "/api/v1/benchmarks/results/name")
        return jsonRes([runName]);
      if (u.pathname === `/api/v1/benchmarks/results/${runName}`)
        return jsonRes({
          results: {
            recipes: [
              {
                id: "jailbreak-dan",
                details: [
                  {
                    data: [
                      { prompt: "x", predicted_result: { response: "no" } },
                    ],
                  },
                ],
              },
            ],
          },
        });
      throw new Error(`unexpected ${url}`);
    });
    const out = await runMoonshotBenchmark(
      cfg,
      {
        connectionId: "c1",
        model: "gpt-4o",
        recipes: ["builtin:moonshot.jailbreak.persona-override-01"],
        resolveTarget,
      },
      mock as unknown as typeof fetch,
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].category).toBe("jailbreak-dan");
  });

  it("throws when the run does not complete before pollTimeoutMs, and still cleans up", async () => {
    let runName = "";
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname === "/api/v1/llm-endpoints" && init?.method === "POST")
        return jsonRes({ message: "ok" });
      if (u.pathname === "/api/v1/benchmarks") {
        runName = (JSON.parse(String(init?.body)) as { run_name: string })
          .run_name;
        return jsonRes({ id: runName });
      }
      if (u.pathname === "/api/v1/benchmarks/status")
        return jsonRes({ [runName]: { current_status: "running" } });
      if (u.pathname === "/api/v1/benchmarks/results/name") return jsonRes([]);
      throw new Error(`unexpected ${url}`);
    });
    const fetchImpl = mock as unknown as typeof fetch;
    await expect(
      runMoonshotBenchmark(
        { ...cfg, pollTimeoutMs: 5 },
        {
          connectionId: "c1",
          model: "m",
          recipes: ["builtin:moonshot.toxicity.slur-bait-01"],
          resolveTarget,
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/timed out/i);
    expect(
      mock.mock.calls.some(
        ([u, init]) =>
          String(u).includes("/api/v1/llm-endpoints/aigp-ep-c1") &&
          (init as unknown as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(true);
  });
});
