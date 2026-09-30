import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    providerConnection: { list: { useQuery: () => ({ data: [] }) } },
    redteam: {
      library: {
        builtin: {
          useQuery: () => ({
            data: { countsByCategory: {}, prompts: [], engineEnabled: false },
          }),
        },
        customList: { useQuery: () => ({ data: [] }) },
      },
    },
    inventory: {
      list: { useQuery: () => ({ data: [{ id: "uc1", name: "System One" }] }) },
    },
  },
}));

import { RunWizard } from "./RunWizard";

const messages = {
  redteam: {
    judgeLabel: "Judge",
    judgeBuiltin: "Builtin",
    judgeNemo: "NeMo",
    judgeNemoHint: "hint",
    linkSystem: { label: "Link to AI system", none: "— None —" },
  },
};

describe("RunWizard", () => {
  it("renders the link-to-system selector", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RunWizard />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Link to AI system")).toBeTruthy();
  });
});
