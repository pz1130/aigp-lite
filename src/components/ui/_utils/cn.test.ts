import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("dedupes conflicting Tailwind classes (last wins)", () => {
    expect(cn("px-2 px-4")).toBe("px-4");
    expect(cn("bg-app", "bg-surface")).toBe("bg-surface");
  });
  it("handles conditional values", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
