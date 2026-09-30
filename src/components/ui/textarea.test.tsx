import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea placeholder="notes" />);
    expect(screen.getByPlaceholderText("notes")).toBeTruthy();
  });
  it("applies invalid styling", () => {
    render(<Textarea invalid data-testid="t" />);
    const t = screen.getByTestId("t");
    expect(t.className).toMatch(/border-danger/);
  });
});
