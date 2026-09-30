import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders title and description", () => {
    render(<PageHeader title="Inventory" description="Track AI usecases." />);
    expect(screen.getByText("Inventory")).toBeTruthy();
    expect(screen.getByText("Track AI usecases.")).toBeTruthy();
  });

  it("renders action slot", () => {
    render(<PageHeader title="X" action={<button>New</button>} />);
    expect(screen.getByText("New")).toBeTruthy();
  });
});
