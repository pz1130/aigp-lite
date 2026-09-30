import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders with default neutral variant", () => {
    render(<Badge>Hello</Badge>);
    const b = screen.getByText("Hello");
    expect(b.className).toMatch(/bg-muted/);
  });

  it("renders success variant", () => {
    render(<Badge variant="success">OK</Badge>);
    const b = screen.getByText("OK");
    expect(b.className).toMatch(/text-success/);
  });

  it("applies critical variant with font-semibold", () => {
    render(<Badge variant="critical">Critical</Badge>);
    const b = screen.getByText("Critical");
    expect(b.className).toMatch(/text-severity-critical/);
    expect(b.className).toMatch(/font-semibold/);
  });

  it("applies sm size", () => {
    render(<Badge size="sm">Small</Badge>);
    const b = screen.getByText("Small");
    expect(b.className).toMatch(/h-\[18px\]/);
  });

  it("applies lg size", () => {
    render(<Badge size="lg">Large</Badge>);
    const b = screen.getByText("Large");
    expect(b.className).toMatch(/h-7/);
  });

  it("forwards ref", () => {
    let ref: HTMLSpanElement | null = null;
    render(
      <Badge
        ref={(el) => {
          ref = el;
        }}
      >
        X
      </Badge>,
    );
    expect(ref).toBeTruthy();
  });
});
