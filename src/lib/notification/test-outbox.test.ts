import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  recordTestEmail,
  getLatestForEmail,
  clearTestOutbox,
  isTestMode,
} from "./test-outbox";

describe("test-outbox", () => {
  beforeEach(() => clearTestOutbox());
  afterEach(() => vi.unstubAllEnvs());

  it("returns the most recently recorded email for an address", () => {
    recordTestEmail({ to: "a@x.com", subject: "1", body: "first" });
    recordTestEmail({ to: "a@x.com", subject: "2", body: "second" });
    expect(getLatestForEmail("a@x.com")?.body).toBe("second");
  });

  it("matches the recipient case-insensitively", () => {
    recordTestEmail({ to: "Foo@X.com", subject: "s", body: "b" });
    expect(getLatestForEmail("foo@x.com")?.subject).toBe("s");
  });

  it("isolates addresses and returns undefined for an unknown one", () => {
    recordTestEmail({ to: "a@x.com", subject: "s", body: "b" });
    expect(getLatestForEmail("b@x.com")).toBeUndefined();
  });

  it("isTestMode is true under the vitest default NODE_ENV", () => {
    expect(isTestMode()).toBe(true);
  });

  it("isTestMode is false when NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isTestMode()).toBe(false);
  });

  it("isTestMode is false when NODE_ENV is unset or unknown", () => {
    vi.stubEnv("NODE_ENV", "");
    expect(isTestMode()).toBe(false);
    vi.stubEnv("NODE_ENV", "staging");
    expect(isTestMode()).toBe(false);
  });

  it("isTestMode re-opens under production when the explicit opt-in is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AIGP_ENABLE_TEST_OUTBOX", "1");
    expect(isTestMode()).toBe(true);
  });

  it('isTestMode ignores any opt-in value other than exactly "1"', () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const v of ["true", "yes", "0", "", "  1 "]) {
      vi.stubEnv("AIGP_ENABLE_TEST_OUTBOX", v);
      expect(isTestMode()).toBe(false);
    }
  });
});
