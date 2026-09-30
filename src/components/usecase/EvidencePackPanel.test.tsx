import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const msgs: Record<string, string> = {
      generate: "Generate Evidence Pack",
      empty: "No evidence packs yet.",
      status: "Status",
      framework: "Framework",
      hash: "Hash",
      created: "Created",
      actions: "Actions",
      download: "Download .zip",
    };
    return msgs[key] ?? key;
  },
}));

import { EvidencePackPanel } from "./EvidencePackPanel";

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      evidencePack: { list: { invalidate: vi.fn() } },
    }),
    evidencePack: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: "p1",
              status: "ready",
              packHash: "abc123",
              createdAt: new Date(),
              framework: "nist-ai-rmf",
              createdBy: { name: "Jo" },
            },
            {
              id: "p2",
              status: "building",
              packHash: null,
              createdAt: new Date(),
              framework: null,
              createdBy: { name: "Jo" },
            },
          ],
          isLoading: false,
        }),
      },
      generate: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

describe("EvidencePackPanel", () => {
  it("shows Generate Evidence Pack button", () => {
    render(<EvidencePackPanel usecaseId="uc1" />);
    expect(screen.getByText(/Generate/i)).toBeTruthy();
  });

  it("shows history list with pack hash for verification", () => {
    render(<EvidencePackPanel usecaseId="uc1" />);
    expect(screen.getByText("abc123")).toBeTruthy();
  });

  it("shows status indicator for building packs", () => {
    render(<EvidencePackPanel usecaseId="uc1" />);
    expect(screen.getByText("building")).toBeTruthy();
  });

  it("offers a .zip download link only for ready packs", () => {
    render(<EvidencePackPanel usecaseId="uc1" />);
    const links = screen.getAllByText("Download .zip");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(
      "/api/evidence-pack/download?id=p1",
    );
  });
});
