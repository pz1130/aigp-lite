import { describe, expect, it } from "vitest";
import en from "@/../messages/en.json";
import zh from "@/../messages/zh.json";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalog parity", () => {
  it("keeps the English and Chinese catalogs on the same key set", () => {
    expect(leafKeys(zh).sort()).toEqual(leafKeys(en).sort());
  });
});
