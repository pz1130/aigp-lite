import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const messages = {
  policyAssistant: {
    title: "Generate with AI",
    usageToday: "Today {used} / {limit}",
    placeholder: "e.g., Block prompts containing complete credit-card numbers",
    generate: "Generate",
    generating: "Generating…",
    selfChecks: "Self-checks",
    expectedHit: "should match",
    expectedMiss: "should NOT match",
    status: { ok: "OK", needs_review: "Needs review", failed: "Failed" },
  },
};

const { mockState } = vi.hoisted(() => ({
  mockState: {
    enabled: true,
    used: 3,
    limit: 20,
    generateResponse: null as unknown,
    generateRejection: null as unknown,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    policyAssistant: {
      isEnabled: { useQuery: () => ({ data: { enabled: mockState.enabled } }) },
      usageToday: {
        useQuery: () => ({
          data: { used: mockState.used, limit: mockState.limit },
          refetch: vi.fn(),
        }),
      },
      generate: {
        useMutation: () => ({
          isPending: false,
          data: mockState.generateResponse,
          error: mockState.generateRejection,
          mutateAsync: async () => mockState.generateResponse,
        }),
      },
    },
  },
}));

import { PolicyAssistantPanel } from "./PolicyAssistantPanel";

function renderPanel(onApply = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PolicyAssistantPanel onApply={onApply} />
    </NextIntlClientProvider>,
  );
  return onApply;
}

describe("PolicyAssistantPanel", () => {
  it("does not render when isEnabled=false", () => {
    mockState.enabled = false;
    renderPanel();
    expect(screen.queryByText("Generate with AI")).toBeFalsy();
    mockState.enabled = true;
  });

  it("renders collapsed initially; expands on click", () => {
    renderPanel();
    expect(screen.getByText("Generate with AI")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeFalsy();
    fireEvent.click(screen.getByText("Generate with AI"));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("shows usage when expanded", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Generate with AI"));
    expect(screen.getByText("Today 3 / 20")).toBeTruthy();
  });

  it("Generate button disabled when description < 10 chars", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Generate with AI"));
    const button = screen.getByRole("button", { name: "Generate" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "short" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "long enough description" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows status chip + self-checks on needs_review", () => {
    mockState.generateResponse = {
      name: "X",
      description: "Y",
      ruleJson: {},
      severity: "high",
      enforcementMode: "block",
      scope: "input",
      tests: [
        { text: "a", shouldHit: true, reason: "p" },
        { text: "b", shouldHit: false, reason: "n" },
        { text: "c", shouldHit: true, reason: "e" },
      ],
      status: "needs_review",
      diagnostics: [{ kind: "self_check_miss", testIndex: 0, message: "miss" }],
    };
    renderPanel();
    fireEvent.click(screen.getByText("Generate with AI"));
    expect(screen.getByText("Needs review")).toBeTruthy();
    fireEvent.click(screen.getByText("Self-checks"));
    expect(screen.getAllByText(/should match/i).length).toBeGreaterThanOrEqual(
      1,
    );
    mockState.generateResponse = null;
  });
});
