import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Popover, PopoverTrigger } from "./popover";

describe("Popover", () => {
  it("renders trigger", () => {
    render(
      <Popover>
        <PopoverTrigger>PopoverTriggerText</PopoverTrigger>
      </Popover>,
    );
    expect(screen.getByText("PopoverTriggerText")).toBeTruthy();
  });
});
