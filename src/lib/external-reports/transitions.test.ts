import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  ExternalReportStateError,
  TERMINAL,
} from "./transitions";

describe("transitions", () => {
  it("allows the legal lifecycle", () => {
    expect(canTransition("received", "triaging")).toBe(true);
    expect(canTransition("triaging", "accepted")).toBe(true);
    expect(canTransition("accepted", "resolved")).toBe(true);
    expect(canTransition("received", "rejected")).toBe(true);
    expect(canTransition("received", "duplicate")).toBe(true);
  });

  it("forbids illegal transitions", () => {
    expect(canTransition("resolved", "accepted")).toBe(false);
    expect(canTransition("accepted", "triaging")).toBe(false);
    expect(() => assertTransition("resolved", "triaging")).toThrow(
      ExternalReportStateError,
    );
  });

  it("marks terminal states", () => {
    expect(TERMINAL.has("resolved")).toBe(true);
    expect(TERMINAL.has("rejected")).toBe(true);
    expect(TERMINAL.has("duplicate")).toBe(true);
    expect(TERMINAL.has("received")).toBe(false);
  });
});
