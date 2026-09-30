import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeTruthy();
  });

  it("applies primary variant by default (bg-accent class present)", () => {
    render(<Button>X</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-accent\b/);
  });

  it("applies danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-danger\b/);
  });

  it("applies sm size (h-7 = 28px)", () => {
    render(<Button size="sm">X</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/h-7\b/);
  });

  it("disabled prop produces disabled attribute + opacity-50", () => {
    render(<Button disabled>X</Button>);
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toMatch(/opacity-50/);
  });

  it("forwards ref", () => {
    let ref: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(el) => {
          ref = el;
        }}
      >
        X
      </Button>,
    );
    expect(ref).toBeTruthy();
  });
});
