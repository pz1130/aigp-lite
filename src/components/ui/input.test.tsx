import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="email" />);
    expect(screen.getByPlaceholderText("email")).toBeTruthy();
  });
  it("applies invalid styling", () => {
    render(<Input invalid data-testid="i" />);
    const i = screen.getByTestId("i");
    expect(i.className).toMatch(/border-danger/);
  });
});
