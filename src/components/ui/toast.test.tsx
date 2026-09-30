import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastRoot, useToast } from "./toast-context";

function Inner() {
  const { toast } = useToast();
  return <button onClick={() => toast({ title: "Hi" })}>Trigger</button>;
}

describe("Toast", () => {
  it("renders ToastRoot children", () => {
    render(
      <ToastRoot>
        <Inner />
      </ToastRoot>,
    );
    expect(screen.getByText("Trigger")).toBeTruthy();
  });
});
