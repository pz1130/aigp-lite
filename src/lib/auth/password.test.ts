import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "hunter2")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("rejects empty passwords", async () => {
    await expect(hashPassword("")).rejects.toThrow(/empty/i);
  });
});
