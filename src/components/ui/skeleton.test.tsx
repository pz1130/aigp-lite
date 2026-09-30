import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders with animate-pulse class", () => {
    const { container } = render(<Skeleton data-testid="s" />);
    const el = container.querySelector('[data-testid="s"]');
    expect(el?.className).toMatch(/animate-pulse/);
  });
});
