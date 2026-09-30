import { describe, it, expect } from "vitest";
import { scrubText } from "./scrub";

describe("scrubText", () => {
  it("redacts emails", () => {
    expect(scrubText("ping alice@corp.io now")).toBe("ping [email] now");
  });
  it("redacts phone numbers", () => {
    expect(scrubText("call +1 (415) 555-2671")).toContain("[phone]");
  });
  it("redacts 16-digit card-like runs", () => {
    expect(scrubText("card 4111 1111 1111 1111")).toContain("[card]");
  });
  it("redacts SSN-like patterns", () => {
    expect(scrubText("ssn 123-45-6789")).toContain("[ssn]");
  });
  it("redacts url query strings but keeps host", () => {
    const out = scrubText("see https://x.io/p?token=abc123&u=42");
    expect(out).toContain("[url]");
    expect(out).not.toContain("token=abc123");
  });
  it("redacts long digit runs", () => {
    expect(scrubText("ref 998877665544")).toContain("[num]");
  });
  it("leaves ordinary usage text intact", () => {
    const s = "summarize the quarterly sales deck for the board";
    expect(scrubText(s)).toBe(s);
  });
  it("is deterministic", () => {
    const s = "email a@b.io and a@b.io";
    expect(scrubText(s)).toBe(scrubText(s));
    expect(scrubText(s)).toBe("email [email] and [email]");
  });
});
