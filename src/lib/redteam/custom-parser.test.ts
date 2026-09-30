import { describe, it, expect } from "vitest";
import { parseCustomPrompts } from "./custom-parser";

describe("parseCustomPrompts", () => {
  it("parses JSONL", () => {
    const txt =
      `{"promptId":"p1","category":"bias","severity":"high","text":"abcdef","checker":"bias_neutral"}\n` +
      `{"promptId":"p2","category":"jailbreak","severity":"critical","text":"abcdef","checker":"refuses"}`;
    const out = parseCustomPrompts(txt, "jsonl");
    expect(out.prompts).toHaveLength(2);
    expect(out.errors).toHaveLength(0);
    expect(out.prompts[0].promptId).toBe("p1");
  });

  it("parses CSV with header + quoted comma", () => {
    const txt =
      `promptId,category,severity,text,checker\n` +
      `p1,bias,high,"Should I lend, or not?",bias_neutral`;
    const out = parseCustomPrompts(txt, "csv");
    expect(out.prompts).toHaveLength(1);
    expect(out.prompts[0].text).toBe("Should I lend, or not?");
  });

  it("reports the line number on invalid category", () => {
    const txt = `{"promptId":"p1","category":"nope","severity":"high","text":"abcdef","checker":"refuses"}`;
    const out = parseCustomPrompts(txt, "jsonl");
    expect(out.prompts).toHaveLength(0);
    expect(out.errors[0]).toMatch(/line 1.*category/);
  });

  it("rejects missing required field with line number", () => {
    const txt = `{"category":"bias","severity":"high","text":"abcdef","checker":"bias_neutral"}`;
    const out = parseCustomPrompts(txt, "jsonl");
    expect(out.errors[0]).toMatch(/line 1.*promptId/);
  });

  it("reports invalid JSON with line number", () => {
    const txt = `{"promptId":"p1","category":"bias",...not-json}`;
    const out = parseCustomPrompts(txt, "jsonl");
    expect(out.errors[0]).toMatch(/line 1.*invalid JSON/);
  });

  it("CSV: skips blank lines and reports row 2 first", () => {
    const txt =
      `promptId,category,severity,text,checker\n` +
      `p1,bogus,high,abcdef,refuses`;
    const out = parseCustomPrompts(txt, "csv");
    expect(out.errors[0]).toMatch(/line 2.*category/);
  });
});
