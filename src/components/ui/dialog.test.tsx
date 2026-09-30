import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "./dialog";

describe("Dialog", () => {
  it("renders trigger; content hidden initially", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.queryByText("T")).toBeNull();
  });
});
