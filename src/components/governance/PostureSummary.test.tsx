import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostureSummary } from "./PostureSummary";
import type { PosturePayload } from "@/lib/governance/posture";

const payload: PosturePayload = {
  score: 72,
  dimensions: [
    {
      key: "controls",
      label: "Control Coverage",
      score: 80,
      weight: 0.4,
      raw: { satisfied: 10, inProgress: 5, failed: 3, applicable: 20 },
    },
    {
      key: "incidents",
      label: "Open Incidents",
      score: 60,
      weight: 0.25,
      raw: { openCount: 3, breachCount: 1, bySeverity: { critical: 1 } },
    },
    {
      key: "drift",
      label: "Drift Health",
      score: 50,
      weight: 0.2,
      raw: { totalBenchmarks: 4, degradedCount: 2, greenCount: 2 },
    },
    {
      key: "budget",
      label: "Budget Posture",
      score: 100,
      weight: 0.15,
      raw: { totalActive: 2, hardCapCount: 0 },
    },
  ],
  usecases: [],
};

describe("PostureSummary", () => {
  it("renders four dimension tiles with their scores", () => {
    render(<PostureSummary data={payload} />);
    expect(screen.getByText("Control Coverage")).toBeTruthy();
    expect(screen.getByText("Open Incidents")).toBeTruthy();
    expect(screen.getByText("Drift Health")).toBeTruthy();
    expect(screen.getByText("Budget Posture")).toBeTruthy();
  });

  it("renders the overall gauge with the score", () => {
    render(<PostureSummary data={payload} />);
    expect(screen.getByText("72")).toBeTruthy();
  });

  it("renders a score breakdown showing the weighting", () => {
    render(<PostureSummary data={payload} />);
    expect(screen.getAllByText(/40%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/25%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/20%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/15%/).length).toBeGreaterThanOrEqual(1);
  });
});
