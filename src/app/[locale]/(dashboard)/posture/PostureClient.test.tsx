import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
  }: {
    href?: unknown;
    children?: React.ReactNode;
  }) => <a href={typeof href === "string" ? href : "#"}>{children}</a>,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    governance: {
      posture: {
        useQuery: () => ({
          data: { score: 72, dimensions: [], usecases: [] },
          isLoading: false,
        }),
      },
    },
    dossier: {
      rollup: {
        useQuery: () => ({
          data: {
            counts: {
              ready: 0,
              conditionally_ready: 0,
              not_ready: 0,
              live: 0,
              highRiskBlocked: 0,
            },
            blocked: [],
          },
          isLoading: false,
        }),
      },
    },
  },
}));

import { PostureClient } from "./PostureClient";

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
      live: "Live",
    },
    checks: {},
  },
};

describe("PostureClient", () => {
  it("renders both tab triggers", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PostureClient />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("tab", { name: "Health Score" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Go-Live Readiness" }),
    ).toBeInTheDocument();
  });
});
