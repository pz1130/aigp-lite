import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

// The locale-aware Link renders an <a>; mock it to a plain anchor so we can read href.
vi.mock("@/i18n/routing", () => ({
  Link: ({
    href,
    children,
  }: {
    href?: unknown;
    children?: React.ReactNode;
  }) => <a href={typeof href === "string" ? href : "#"}>{children}</a>,
}));

import { AgentTestingHint, type AgentTestingLayer } from "./AgentTestingHint";

const messages = {
  agentTesting: {
    learnMore: "Learn more",
    connect: {
      title: "Connect your agent",
      tests: "register API",
      prereq: "OpenAI API",
      cta: "Add a connection",
    },
    mouth: {
      title: "Mouth title",
      tests: "says",
      prereq: "connect first",
      cta: "Start a red-team run",
    },
    hands: {
      title: "Hands title",
      tests: "does",
      prereq: "MCP",
      cta: "Register an MCP server",
    },
    compliance: {
      title: "Compliance title",
      tests: "governed",
      prereq: "describe",
      cta: "Register a use-case",
    },
  },
};

function renderHint(layer: AgentTestingLayer, locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AgentTestingHint layer={layer} />
    </NextIntlClientProvider>,
  );
}

const CTA_HREF: Record<AgentTestingLayer, string> = {
  connect: "/integrations/providers/new",
  mouth: "/redteam/runs/new",
  hands: "/mcp/new",
  compliance: "/inventory/new",
};

describe("AgentTestingHint", () => {
  it.each(["connect", "mouth", "hands", "compliance"] as AgentTestingLayer[])(
    "renders title, tests, prereq and the correct CTA link for %s",
    (layer) => {
      renderHint(layer);
      expect(
        screen.getByText(messages.agentTesting[layer].title),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages.agentTesting[layer].tests),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages.agentTesting[layer].prereq),
      ).toBeInTheDocument();
      const cta = screen.getByRole("link", {
        name: messages.agentTesting[layer].cta,
      });
      expect(cta).toHaveAttribute("href", CTA_HREF[layer]);
    },
  );

  it("links the docs guide to the English file for the en locale", () => {
    renderHint("mouth", "en");
    const doc = screen.getByRole("link", { name: /Learn more/ });
    expect(doc.getAttribute("href")).toMatch(/\/testing-your-agent\.md$/);
  });

  it("links the docs guide to the Chinese file for the zh locale", () => {
    renderHint("mouth", "zh");
    const doc = screen.getByRole("link", { name: /Learn more/ });
    expect(doc.getAttribute("href")).toMatch(/\/testing-your-agent\.zh\.md$/);
  });
});
