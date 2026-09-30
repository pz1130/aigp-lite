import { describe, it, expect } from "vitest";
import { renderFriaPdf, type FriaWithIncludes } from "./pdf";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const fixture: FriaWithIncludes = {
  id: "f1",
  orgId: "o1",
  usecaseId: "u1",
  version: 1,
  status: "approved",
  title: "Test FRIA",
  sectionsJson: {
    system: { name: "Test System", annexIIICategory: "education" },
    purpose: { description: "Help students" },
    overallRisk: { rating: "medium", rationale: "Moderate impact" },
  } as object,
  createdById: "c1",
  submittedAt: new Date(),
  submittedById: "c1",
  approvedAt: new Date(),
  approvedById: "a1",
  archivedAt: null,
  archivedById: null,
  supersededById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  org: { id: "o1", name: "Demo Org" },
  usecase: { id: "u1", name: "Demo Usecase" },
  createdBy: { id: "c1", name: "Creator", email: "c@x" },
  submittedBy: { id: "c1", name: "Creator", email: "c@x" },
  approvedBy: { id: "a1", name: "Approver", email: "a@x" },
};

describe("renderFriaPdf", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await renderFriaPdf(fixture);
    expect(buf.length).toBeGreaterThan(500);
  });

  it("output starts with PDF magic bytes", async () => {
    const buf = await renderFriaPdf(fixture);
    expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("output contains PDF structure markers", async () => {
    const buf = await renderFriaPdf(fixture);
    const str = buf.toString("latin1");
    // PDF files always contain these structural markers
    expect(str).toContain("endobj");
    expect(str).toContain("stream");
  });
});
