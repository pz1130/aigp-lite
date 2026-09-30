import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders as button (Radix Root)", () => {
    render(<Checkbox aria-label="c" />);
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
});
