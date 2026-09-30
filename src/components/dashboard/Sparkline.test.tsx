import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("renders polyline with N-1 segments", () => {
    const { container } = render(
      <Sparkline values={[1, 2, 3, 4, 5]} width={100} height={20} />,
    );
    const line = container.querySelector("polyline");
    expect(line).toBeTruthy();
    const pts = line!.getAttribute("points")!.split(" ");
    expect(pts.length).toBe(5);
  });
});
