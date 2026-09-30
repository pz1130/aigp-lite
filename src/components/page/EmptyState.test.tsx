import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders icon and title", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No items"
        description="Add your first item."
      />,
    );
    expect(screen.getByText("No items")).toBeTruthy();
    expect(screen.getByText("Add your first item.")).toBeTruthy();
  });
});
