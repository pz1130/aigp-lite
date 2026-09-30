import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Switch } from "./switch";

describe("Switch", () => {
  it("renders as switch", () => {
    render(<Switch aria-label="s" />);
    expect(screen.getByRole("switch")).toBeTruthy();
  });
});
