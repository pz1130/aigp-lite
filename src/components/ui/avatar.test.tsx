import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback } from "./avatar";

describe("Avatar", () => {
  it("renders fallback", () => {
    render(
      <Avatar>
        <AvatarFallback>JC</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("JC")).toBeTruthy();
  });
});
