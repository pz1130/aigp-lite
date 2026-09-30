import { describe, it, expect, vi } from "vitest";
import {
  isCircuitOpen,
  isRetryableRuntimeError,
  parseRuntimeReliabilityConfig,
  recordCircuitFailure,
  recordCircuitSuccess,
  withReliability,
} from "./reliability";
import type {
  ProviderAdapter,
  StreamChunk,
  AdapterStreamOpts,
} from "./providers/types";

function makeChunk(delta: string, done = false): StreamChunk {
  return { delta, done };
}

function errorAdapter(err: Error) {
  return {
    ping: vi.fn(),
    streamChat: vi.fn().mockImplementation(async function* () {
      throw err;
    }),
  } as unknown as ProviderAdapter;
}

describe("runtime reliability config", () => {
  it("parses fallback and circuit breaker defaults", () => {
    const cfg = parseRuntimeReliabilityConfig({
      fallbackConnectionId: "c2",
      fallbackModel: "m2",
    });
    expect(cfg.fallbackConnectionId).toBe("c2");
    expect(cfg.fallbackModel).toBe("m2");
    expect(cfg.circuitBreaker.failureThreshold).toBe(3);
    expect(cfg.circuitBreaker.cooldownMs).toBe(300000);
  });

  it("detects open circuit only before openedUntil", () => {
    const now = new Date("2026-05-23T10:00:00Z");
    expect(
      isCircuitOpen(
        { circuitState: { openedUntil: "2026-05-23T10:01:00Z" } },
        now,
      ),
    ).toBe(true);
    expect(
      isCircuitOpen(
        { circuitState: { openedUntil: "2026-05-23T09:59:00Z" } },
        now,
      ),
    ).toBe(false);
  });

  it("opens circuit at configured failure threshold", () => {
    const now = new Date("2026-05-23T10:00:00Z");
    const first = recordCircuitFailure(
      { circuitBreaker: { failureThreshold: 2, cooldownMs: 60000 } },
      now,
    );
    expect(first.opened).toBe(false);
    const second = recordCircuitFailure(first.config, now);
    expect(second.opened).toBe(true);
    expect(isCircuitOpen(second.config, now)).toBe(true);
  });

  it("clears circuit state on success", () => {
    const next = recordCircuitSuccess({
      fallbackConnectionId: "c2",
      circuitState: {
        consecutiveFailures: 3,
        openedUntil: "2026-05-23T10:01:00Z",
      },
    });
    expect(next.fallbackConnectionId).toBe("c2");
    expect(next.circuitState).toBeUndefined();
  });

  it("recognizes retryable runtime errors", () => {
    expect(isRetryableRuntimeError(new Error("503 Service Unavailable"))).toBe(
      true,
    );
    expect(isRetryableRuntimeError(new Error("timeout"))).toBe(true);
    expect(isRetryableRuntimeError(new Error("401 Unauthorized"))).toBe(false);
  });
});

describe("withReliability", () => {
  it("retries on 503 then succeeds on second attempt", async () => {
    const err503 = new Error("503 Service Unavailable");
    const adapter = errorAdapter(err503);
    const wrapped = withReliability(adapter, {
      timeoutMs: 2000,
      maxRetries: 1,
    });
    const gen = wrapped.streamChat({
      baseUrl: "",
      credentials: {},
      config: {},
      model: "gpt-4",
      messages: [],
    });
    await expect(async () => {
      for await (const _ of gen) {
      }
    }).rejects.toThrow("503");
    expect(vi.mocked(adapter.streamChat).mock.calls.length).toBe(2);
  });

  it("does not retry on non-5xx/429 errors", async () => {
    const adapter = errorAdapter(new Error("401 Unauthorized"));
    const wrapped = withReliability(adapter, {
      timeoutMs: 2000,
      maxRetries: 3,
    });
    const gen = wrapped.streamChat({
      baseUrl: "",
      credentials: {},
      config: {},
      model: "gpt-4",
      messages: [],
    });
    await expect(async () => {
      for await (const _ of gen) {
      }
    }).rejects.toThrow("401 Unauthorized");
    expect(vi.mocked(adapter.streamChat).mock.calls.length).toBe(1);
  });

  it("does not retry after a chunk has been yielded", async () => {
    const chunks = [makeChunk("hello")];
    const adapter = {
      ping: vi.fn(),
      streamChat: vi.fn().mockImplementation(async function* () {
        for (const c of chunks) yield c;
        throw new Error("503 after chunk");
      }),
    } as unknown as ProviderAdapter;
    const wrapped = withReliability(adapter, {
      timeoutMs: 2000,
      maxRetries: 3,
    });
    const results: StreamChunk[] = [];
    const gen = wrapped.streamChat({
      baseUrl: "",
      credentials: {},
      config: {},
      model: "gpt-4",
      messages: [],
    });
    try {
      for await (const ch of gen) results.push(ch);
    } catch (_) {}
    expect(results).toEqual([makeChunk("hello")]);
    expect(vi.mocked(adapter.streamChat).mock.calls.length).toBe(1);
  });

  it("aborts on timeout", async () => {
    const adapter = {
      ping: vi.fn(),
      streamChat: vi.fn().mockImplementation(async function* (
        opts: AdapterStreamOpts,
      ) {
        // Check signal before sleeping
        if (opts.signal?.aborted) throw new Error("timeout");
        // Sleep longer than the 50ms timeout
        await new Promise((r) => setTimeout(r, 200));
        if (opts.signal?.aborted) throw new Error("timeout");
        yield makeChunk("late");
      }),
    } as unknown as ProviderAdapter;
    const wrapped = withReliability(adapter, { timeoutMs: 50, maxRetries: 0 });
    const start = Date.now();
    const gen = wrapped.streamChat({
      baseUrl: "",
      credentials: {},
      config: {},
      model: "gpt-4",
      messages: [],
    });
    await expect(async () => {
      for await (const _ of gen) {
      }
    }).rejects.toThrow("timeout");
    expect(Date.now() - start).toBeLessThan(400);
  });
});
