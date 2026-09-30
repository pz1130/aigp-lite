import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns first successful result without retry", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const out = await withRetry(fn, {
      maxAttempts: 3,
      backoffMs: [10, 20, 40],
    });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures until success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("503"))
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValue("ok");
    const out = await withRetry(fn, { maxAttempts: 3, backoffMs: [1, 1, 1] });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 boom"));
    await expect(
      withRetry(fn, { maxAttempts: 3, backoffMs: [1, 1, 1] }),
    ).rejects.toThrow(/503 boom/);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
