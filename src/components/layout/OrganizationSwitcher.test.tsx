import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

vi.mock("./actions", () => ({ switchOrganizationAction: vi.fn() }));
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const messages = {
  nav: {
    organization: {
      label: "Organization",
      error: "Could not switch organization.",
    },
  },
};

const organizations = [
  { id: "org-1", name: "First Organization", role: "admin" as const },
  { id: "org-2", name: "Second Organization", role: "viewer" as const },
];

function renderSwitcher(
  props: Partial<Parameters<typeof OrganizationSwitcher>[0]> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrganizationSwitcher
        organizations={organizations}
        activeOrgId="org-1"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("OrganizationSwitcher", () => {
  it("does not render when the user has one organization", () => {
    renderSwitcher({ organizations: [organizations[0]] });
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders the active organization and available organizations", () => {
    renderSwitcher();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByText("First Organization")).toBeTruthy();
  });
});
