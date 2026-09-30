import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tooltip, TooltipProvider } from "./tooltip";

describe("Tooltip", () => {
  it("renders trigger", () => {
    render(
      <TooltipProvider>
        <Tooltip content="Hi">
          <button>Hover</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText("Hover")).toBeTruthy();
  });
});
