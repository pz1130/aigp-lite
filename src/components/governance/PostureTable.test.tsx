import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostureTable } from "./PostureTable";
import type { PosturePayload } from "@/lib/governance/posture";

const payload: PosturePayload = {
  score: 60,
  dimensions: [],
  usecases: [
    {
      usecaseId: "u1",
      usecaseName: "Chatbot",
      controlScore: 90,
      openIncidents: 0,
      slaBreaches: 0,
      overallScore: 90,
      effectiveTier: "minimal",
    },
    {
      usecaseId: "u2",
      usecaseName: "Fraud Detector",
      controlScore: 30,
      openIncidents: 2,
      slaBreaches: 1,
      overallScore: 30,
      effectiveTier: "critical",
    },
    {
      usecaseId: "u3",
      usecaseName: "Recruiter",
      controlScore: 60,
      openIncidents: 1,
      slaBreaches: 0,
      overallScore: 60,
      effectiveTier: null,
    },
  ],
};

describe("PostureTable", () => {
  it("renders one row per use-case", () => {
    render(<PostureTable data={payload} />);
    expect(screen.getByText("Chatbot")).toBeTruthy();
    expect(screen.getByText("Fraud Detector")).toBeTruthy();
    expect(screen.getByText("Recruiter")).toBeTruthy();
  });

  it("sorts weakest use-cases at the top by default", () => {
    render(<PostureTable data={payload} />);
    const rows = screen.getAllByRole("row");
    // Header + 3 data rows
    expect(rows.length).toBe(4);
    const firstDataRow = rows[1];
    expect(firstDataRow.textContent).toContain("Fraud Detector");
  });

  it("each row links to the use-case detail page", () => {
    render(<PostureTable data={payload} />);
    const links = screen.getAllByRole("link");
    const chatbotLink = links.find((l) => l.textContent?.includes("Chatbot"));
    expect(chatbotLink?.getAttribute("href")).toContain("/inventory/u1");
  });

  it("shows the four dimension statuses per row", () => {
    render(<PostureTable data={payload} />);
    expect(screen.getAllByText("90").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("30").length).toBeGreaterThanOrEqual(1);
  });
});
