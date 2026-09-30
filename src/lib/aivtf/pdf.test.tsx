import { describe, it, expect } from "vitest";
import { renderAivtfPdf, type AivtfWithIncludes } from "./pdf";
import type { CatalogPrinciple } from "./catalog";
import { disableReactActEnvironment } from "../../../tests/react-pdf-act";

disableReactActEnvironment();

const catalog: CatalogPrinciple[] = [
  {
    id: "p1",
    num: 1,
    key: "transparency",
    title: "Transparency",
    blurb: null,
    order: 1,
    outcomes: [
      {
        id: "o1",
        principleId: "p1",
        code: "1.1",
        text: "Disclosure",
        order: 1,
        processes: [
          {
            id: "pr1",
            outcomeId: "o1",
            code: "1.1.1",
            text: "Policy",
            typeOfAI: "ALL",
            evidenceType: "Doc",
            evidenceGuidance: null,
            order: 1,
          },
        ],
      },
    ],
  },
];

const a = {
  id: "a1",
  orgId: "o1",
  usecaseId: null,
  version: 1,
  status: "draft",
  title: "Test",
  createdById: "u1",
  submittedAt: null,
  submittedById: null,
  approvedAt: null,
  approvedById: null,
  archivedAt: null,
  archivedById: null,
  supersededById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  org: { id: "o1", name: "Acme" },
  usecase: null,
  createdBy: { id: "u1", name: "Jo", email: "jo@x.io" },
  answers: [{ processCode: "1.1.1", status: "yes", elaboration: "ok" }],
} as unknown as AivtfWithIncludes;

describe("renderAivtfPdf", () => {
  it("renders a non-empty PDF buffer", async () => {
    const buf = await renderAivtfPdf(a, catalog);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
