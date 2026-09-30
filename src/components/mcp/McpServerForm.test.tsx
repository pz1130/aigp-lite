import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    mcp: {
      create: { useMutation: () => ({ isPending: false, mutate: mockMutate }) },
      update: { useMutation: () => ({ isPending: false, mutate: mockMutate }) },
    },
  },
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const messages = {
  mcp: {
    fields: {
      name: "Name",
      endpoint: "Endpoint",
      transport: "Transport",
      authType: "Auth Type",
      riskTier: "Risk Tier",
      owner: "Owner",
      notes: "Notes",
    },
    transport: { stdio: "stdio", http: "HTTP" },
    authType: { none: "None", token: "Token", oauth: "OAuth" },
    riskTier: {
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical",
    },
    tools: {
      title: "Tools",
      addTool: "Add Tool",
      empty: "No tools",
      name: "Tool Name",
      description: "Description",
    },
    drift: {
      tokenLabel: "Bearer token (optional)",
      tokenHint: "Used only for daily tools/list polling.",
      tokenSet: "A token is stored.",
    },
    addServer: "Add Server",
  },
  common: { save: "Save", cancel: "Cancel" },
};

import { McpServerForm } from "./McpServerForm";

function renderForm(props: Partial<ComponentProps<typeof McpServerForm>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <McpServerForm mode="create" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("McpServerForm", () => {
  it("renders all required fields", () => {
    renderForm();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Endpoint")).toBeTruthy();
    expect(screen.getByText("Transport")).toBeTruthy();
  });

  it("renders Add Tool button", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /Add Tool/i })).toBeTruthy();
  });

  it("adds a tool row when Add Tool clicked", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Add Tool/i }));
    expect(screen.getByPlaceholderText(/Tool Name/i)).toBeTruthy();
  });

  it("removes a tool row when X clicked", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Add Tool/i }));
    expect(screen.getByPlaceholderText(/Tool Name/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    expect(screen.queryByPlaceholderText(/Tool Name/i)).toBeNull();
  });
});
