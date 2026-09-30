import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SplitText } from "./SplitText";

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("SplitText", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("renders each character as its own span (ASCII)", () => {
    mockReducedMotion(false);
    render(<SplitText text="Hello" />);
    const root = screen.getByTestId("split-text");
    expect(root.querySelectorAll("span[data-char]").length).toBe(5);
  });

  it("splits Unicode characters safely (Chinese mixed with ASCII)", () => {
    mockReducedMotion(false);
    render(<SplitText text="让 A I" />);
    expect(
      screen.getByTestId("split-text").querySelectorAll("span[data-char]")
        .length,
    ).toBe(5);
  });

  it("preserves the full string for screen readers via aria-label", () => {
    mockReducedMotion(false);
    render(<SplitText text="Govern AI" />);
    expect(screen.getByLabelText("Govern AI")).toBeTruthy();
  });

  it("when prefers-reduced-motion is set, applies the reduced data-attribute", () => {
    mockReducedMotion(true);
    render(<SplitText text="Hi" />);
    expect(screen.getByTestId("split-text").getAttribute("data-reduced")).toBe(
      "true",
    );
  });
});
