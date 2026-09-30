import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    drift: {
      create: { useMutation: () => ({ isPending: false, mutate: mockMutate }) },
      update: { useMutation: () => ({ isPending: false, mutate: mockMutate }) },
    },
    inventory: {
      list: { useQuery: () => ({ data: [{ id: "uc1", name: "System One" }] }) },
    },
  },
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const messages = {
  drift: {
    fields: {
      name: "Name",
      description: "Description",
      threshold: "Threshold",
    },
    form: {
      prompts: "Prompts",
      addPrompt: "Add Prompt",
      removePrompt: "Remove",
      promptText: "Prompt Text",
      expectedBehavior: "Expected Behavior",
      referenceOutput: "Reference Output",
    },
    linkSystem: { label: "Link to AI system", none: "— None —" },
    addBenchmark: "New Benchmark",
    empty: "No prompts added",
  },
  common: { save: "Save", cancel: "Cancel" },
};

import { DriftBenchmarkForm } from "./DriftBenchmarkForm";

function renderForm(
  props: Partial<ComponentProps<typeof DriftBenchmarkForm>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DriftBenchmarkForm mode="create" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("DriftBenchmarkForm", () => {
  it("renders all required fields", () => {
    renderForm();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Description")).toBeTruthy();
    expect(screen.getByText("Threshold")).toBeTruthy();
  });

  it("renders Add Prompt button", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /Add Prompt/i })).toBeTruthy();
  });

  it("adds a prompt row when Add Prompt clicked", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Add Prompt/i }));
    expect(screen.getByText("Prompt Text")).toBeTruthy();
    expect(screen.getByText("Expected Behavior")).toBeTruthy();
  });

  it("removes a prompt row when Remove clicked", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Add Prompt/i }));
    expect(screen.getByText("#1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    expect(screen.queryByText("#1")).toBeNull();
  });

  it("renders the link-to-system selector", () => {
    renderForm();
    expect(screen.getByText("Link to AI system")).toBeTruthy();
  });
});
