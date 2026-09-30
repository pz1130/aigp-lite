import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReadinessRollup } from "@/lib/dossier/rollup";

// Locale-aware Link -> plain anchor so we can read href.
vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
  }: {
    href?: unknown;
    children?: React.ReactNode;
  }) => <a href={typeof href === "string" ? href : "#"}>{children}</a>,
}));

const state: { data: ReadinessRollup | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};

vi.mock("@/lib/trpc/client", () => ({
  trpc: { dossier: { rollup: { useQuery: () => state } } },
}));

import { ReadinessRollupClient } from "./ReadinessRollupClient";

const messages = {
  posture: {
    readiness: {
      tabHealth: "Health Score",
      tabReadiness: "Go-Live Readiness",
      loading: "Loading…",
      highRiskBlocked: "High-risk blocked",
      colSystem: "System",
      colOwner: "Owner",
      colHighRisk: "Risk",
      colBlockingChecks: "Blocking checks",
      highRiskBadge: "High risk",
      noOwner: "—",
      empty: "No systems are blocked from go-live",
    },
  },
  dossier: {
    state: {
      not_ready: "Not ready",
      conditionally_ready: "Conditionally ready",
      ready: "Ready",
      needs_re_review: "Needs re-review",
      live: "Live",
    },
    checks: {
      fria: { label: "FRIA (Art. 27)" },
      redteam: { label: "Adversarial testing (Art. 15)" },
    },
  },
};

function renderClient() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReadinessRollupClient />
    </NextIntlClientProvider>,
  );
}

describe("ReadinessRollupClient", () => {
  it("renders count cards and a blocked row with check labels and a drill-down link", () => {
    state.data = {
      counts: {
        ready: 3,
        conditionally_ready: 2,
        not_ready: 1,
        needs_re_review: 0,
        live: 4,
        highRiskBlocked: 1,
      },
      blocked: [
        {
          usecaseId: "uc1",
          name: "Fraud Scorer",
          ownerName: "Dana",
          isHighRisk: true,
          euAiActCategory: "high",
          blockingCheckIds: ["fria", "redteam"],
        },
      ],
    };
    renderClient();

    // count cards: high-risk-blocked card + state labels
    expect(screen.getByText("High-risk blocked")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Not ready")).toBeInTheDocument();

    // blocked row
    expect(screen.getByText("Fraud Scorer")).toBeInTheDocument();
    expect(screen.getByText("Dana")).toBeInTheDocument();
    expect(screen.getByText("FRIA (Art. 27)")).toBeInTheDocument();
    expect(
      screen.getByText("Adversarial testing (Art. 15)"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Fraud Scorer" });
    expect(link).toHaveAttribute("href", "/inventory/uc1");
  });

  it("renders the empty state when nothing is blocked", () => {
    state.data = {
      counts: {
        ready: 5,
        conditionally_ready: 0,
        not_ready: 0,
        needs_re_review: 0,
        live: 0,
        highRiskBlocked: 0,
      },
      blocked: [],
    };
    renderClient();
    expect(
      screen.getByText("No systems are blocked from go-live"),
    ).toBeInTheDocument();
  });
});
