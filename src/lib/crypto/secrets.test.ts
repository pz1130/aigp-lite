import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  encryptJson,
  decryptJson,
  encryptJsonWithKey,
  decryptJsonWithKey,
  _testReset,
} from "./secrets";

describe("secrets", () => {
  beforeEach(() => {
    _testReset();
  });

  it("round-trips a JSON payload", () => {
    process.env.AIGP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const blob = encryptJson({ apiKey: "sk-abc", extra: { x: 1 } });
    expect(decryptJson(blob)).toEqual({ apiKey: "sk-abc", extra: { x: 1 } });
  });

  it("rejects when IV is tampered", () => {
    process.env.AIGP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const blob = encryptJson({ apiKey: "sk-abc" });
    blob[0] ^= 0xff;
    expect(() => decryptJson(blob)).toThrow();
  });

  it("rejects when ciphertext is tampered", () => {
    process.env.AIGP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const blob = encryptJson({ apiKey: "sk-abc" });
    blob[20] ^= 0xff;
    expect(() => decryptJson(blob)).toThrow();
  });

  it("rejects when authTag is tampered", () => {
    process.env.AIGP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const blob = encryptJson({ apiKey: "sk-abc" });
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptJson(blob)).toThrow();
  });

  it("derives a dev fallback key from AIGP_ENCRYPTION_SEED when AIGP_ENCRYPTION_KEY missing and NODE_ENV=development", () => {
    delete process.env.AIGP_ENCRYPTION_KEY;
    vi.stubEnv("NODE_ENV", "development");
    process.env.AIGP_ENCRYPTION_SEED = "test-seed-1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blob = encryptJson({ apiKey: "x" });
    expect(decryptJson(blob)).toEqual({ apiKey: "x" });
    expect(warn).toHaveBeenCalled();
  });

  it("throws in production when AIGP_ENCRYPTION_KEY missing", () => {
    delete process.env.AIGP_ENCRYPTION_KEY;
    vi.stubEnv("NODE_ENV", "production");
    expect(() => encryptJson({ apiKey: "x" })).toThrow(/AIGP_ENCRYPTION_KEY/);
  });

  describe("explicit-key variants", () => {
    const KEY_A = Buffer.alloc(32, 1);
    const KEY_B = Buffer.alloc(32, 2);

    it("round-trips with an explicit key, independent of env", () => {
      delete process.env.AIGP_ENCRYPTION_KEY;
      const blob = encryptJsonWithKey(KEY_A, { apiKey: "sk-x" });
      expect(decryptJsonWithKey(KEY_A, blob)).toEqual({ apiKey: "sk-x" });
    });

    it("throws when decrypting with the wrong key", () => {
      const blob = encryptJsonWithKey(KEY_A, { apiKey: "sk-x" });
      expect(() => decryptJsonWithKey(KEY_B, blob)).toThrow();
    });

    it("is interoperable with the env-key wrappers (same blob format)", () => {
      process.env.AIGP_ENCRYPTION_KEY = KEY_A.toString("base64");
      _testReset();
      // wrapper-encrypted → explicit-decrypted
      expect(decryptJsonWithKey(KEY_A, encryptJson({ v: 1 }))).toEqual({
        v: 1,
      });
      // explicit-encrypted → wrapper-decrypted
      expect(decryptJson(encryptJsonWithKey(KEY_A, { v: 2 }))).toEqual({
        v: 2,
      });
    });
  });
});
