import { describe, it, expect } from "vitest";
import { signRenderedAt, verifyRenderedAt, hashIp } from "./anti-abuse";

describe("anti-abuse", () => {
  it("round-trips a signed timestamp", () => {
    const ts = Date.now();
    expect(verifyRenderedAt(signRenderedAt(ts))).toBe(ts);
  });

  it("rejects a tampered signature", () => {
    const token = signRenderedAt(Date.now());
    const [tsPart] = token.split(".");
    expect(verifyRenderedAt(`${tsPart}.deadbeef`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyRenderedAt("")).toBeNull();
    expect(verifyRenderedAt("nodot")).toBeNull();
  });

  it("hashes IPs deterministically and never returns the raw IP", () => {
    const h = hashIp("203.0.113.7");
    expect(h).toBe(hashIp("203.0.113.7"));
    expect(h).not.toContain("203.0.113.7");
    expect(hashIp(null)).toBe(hashIp(undefined));
  });
});
