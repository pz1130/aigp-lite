import { describe, it, expect, vi, beforeEach } from "vitest";
// We test the re-export shim via the incidents path; internal implementation
// lives in @/lib/observability/metrics but we re-export from incidents/metrics.
import * as IncidentsMetrics from "@/lib/incidents/metrics";

const { count, gauge, distribution, timing, metric } = IncidentsMetrics;

vi.mock("@sentry/nextjs", () => ({
  __esModule: true,
  default: { metrics: {} },
  metrics: {
    count: vi.fn(),
    gauge: vi.fn(),
    distribution: vi.fn(),
  },
}));

describe("metrics (observability)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- count ---

  it("count emits Sentry.metrics.count with name and default unit", async () => {
    const { metrics } = await import("@sentry/nextjs");
    count("test.count");
    expect(metrics.count).toHaveBeenCalledOnce();
    expect(metrics.count).toHaveBeenCalledWith(
      "test.count",
      1,
      expect.objectContaining({ attributes: {} }),
    );
  });

  it("count serialises tags as string attributes", async () => {
    const { metrics } = await import("@sentry/nextjs");
    count("test.count", { status: "ok", code: 200 });
    expect(metrics.count).toHaveBeenCalledWith(
      "test.count",
      1,
      expect.objectContaining({
        attributes: { status: "ok", code: "200" },
      }),
    );
  });

  // --- gauge ---

  it("gauge emits Sentry.metrics.gauge with value and tags", async () => {
    const { metrics } = await import("@sentry/nextjs");
    gauge("test.gauge", 42);
    expect(metrics.gauge).toHaveBeenCalledOnce();
    expect(metrics.gauge).toHaveBeenCalledWith(
      "test.gauge",
      42,
      expect.objectContaining({ attributes: {} }),
    );
  });

  it("gauge passes tags correctly", async () => {
    const { metrics } = await import("@sentry/nextjs");
    gauge("test.gauge", 3.14, { env: "test" });
    expect(metrics.gauge).toHaveBeenCalledWith(
      "test.gauge",
      3.14,
      expect.objectContaining({ attributes: { env: "test" } }),
    );
  });

  // --- distribution ---

  it("distribution emits Sentry.metrics.distribution with value and tags", async () => {
    const { metrics } = await import("@sentry/nextjs");
    distribution("test.dist", 99);
    expect(metrics.distribution).toHaveBeenCalledOnce();
    expect(metrics.distribution).toHaveBeenCalledWith(
      "test.dist",
      99,
      expect.objectContaining({ attributes: {} }),
    );
  });

  it("distribution passes tags correctly", async () => {
    const { metrics } = await import("@sentry/nextjs");
    distribution("test.dist", 7, { bucket: "fast" });
    expect(metrics.distribution).toHaveBeenCalledWith(
      "test.dist",
      7,
      expect.objectContaining({ attributes: { bucket: "fast" } }),
    );
  });

  // --- timing ---

  it("timing returns the wrapped function result", async () => {
    const result = await timing("test.timing", async () => "ok");
    expect(result).toBe("ok");
  });

  it("timing throws when fn throws", async () => {
    await expect(
      timing("test.timing", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("timing emits a distribution with the measured duration in ms", async () => {
    vi.useFakeTimers();
    const { metrics } = await import("@sentry/nextjs");

    // Freeze time at 0, advance 50ms during fn, then resolve
    const delayPromise = timing("test.timing", async () => {
      vi.advanceTimersByTime(50);
      return "done";
    });

    // Run all pending promises so the timing wrapper can measure
    await vi.runAllTimersAsync();
    await delayPromise;

    expect(metrics.distribution).toHaveBeenCalledOnce();
    const [name, value, opts] = vi.mocked(metrics.distribution).mock.calls[0]!;
    expect(name).toBe("test.timing");
    expect(typeof value).toBe("number");
    expect(opts).toEqual(expect.objectContaining({ attributes: {} }));

    vi.useRealTimers();
  });

  it("timing passes tags to the distribution call", async () => {
    vi.useFakeTimers();
    const { metrics } = await import("@sentry/nextjs");

    const delayPromise = timing(
      "test.timing",
      async () => {
        vi.advanceTimersByTime(10);
        return "done";
      },
      { route: "/api/incidents" },
    );

    await vi.runAllTimersAsync();
    await delayPromise;

    expect(metrics.distribution).toHaveBeenCalledWith(
      "test.timing",
      expect.any(Number),
      expect.objectContaining({ attributes: { route: "/api/incidents" } }),
    );

    vi.useRealTimers();
  });

  // --- metric (alias) ---

  it("metric is an alias for count", async () => {
    const { metrics } = await import("@sentry/nextjs");
    metric("test.metric", { type: "alias" });
    expect(metrics.count).toHaveBeenCalledOnce();
    expect(metrics.count).toHaveBeenCalledWith(
      "test.metric",
      1,
      expect.objectContaining({ attributes: { type: "alias" } }),
    );
  });

  // --- never break the request path ---

  it("count swallows errors and never propagates", async () => {
    const { metrics } = await import("@sentry/nextjs");
    vi.mocked(metrics.count).mockImplementationOnce(() => {
      throw new Error("Sentry is down");
    });
    expect(() => count("fail.count")).not.toThrow();
    expect(() => count("fail.count", { a: "b" })).not.toThrow();
  });

  it("gauge swallows errors and never propagates", async () => {
    const { metrics } = await import("@sentry/nextjs");
    vi.mocked(metrics.gauge).mockImplementationOnce(() => {
      throw new Error("Sentry is down");
    });
    expect(() => gauge("fail.gauge", 0)).not.toThrow();
  });

  it("distribution swallows errors and never propagates", async () => {
    const { metrics } = await import("@sentry/nextjs");
    vi.mocked(metrics.distribution).mockImplementationOnce(() => {
      throw new Error("Sentry is down");
    });
    expect(() => distribution("fail.dist", 0)).not.toThrow();
  });

  it("timing swallows errors from distribution but still propagates fn errors", async () => {
    const { metrics } = await import("@sentry/nextjs");
    vi.mocked(metrics.distribution).mockImplementationOnce(() => {
      throw new Error("Sentry is down");
    });
    vi.useFakeTimers();
    const p = timing("fail.timing", async () => {
      vi.advanceTimersByTime(5);
      return "ok";
    });
    await vi.runAllTimersAsync();
    // Must NOT throw — distribution error is swallowed
    expect(await p).toBe("ok");
    vi.useRealTimers();
  });
});
