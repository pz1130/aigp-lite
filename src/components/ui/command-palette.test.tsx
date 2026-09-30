import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CommandPalette, CommandItem } from "./command-palette";

describe("CommandPalette", () => {
  it("renders without crashing when closed", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <CommandPalette open={false} onOpenChange={onOpenChange}>
        <CommandItem>Item</CommandItem>
      </CommandPalette>,
    );
    // Just verify no throw — content is portaled and hidden when open=false
    expect(container).toBeTruthy();
  });
});
