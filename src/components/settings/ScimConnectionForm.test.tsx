import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

// The locale-aware Link renders an <a>; mock it to a plain anchor so it
// doesn't need next-intl's routing context under test.
vi.mock("@/i18n/routing", () => ({
  Link: ({ href, children }: { href?: unknown; children?: ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

const { mockUpsert, mockRotate, mockToggle, scimQuery, ssoQuery } = vi.hoisted(
  () => ({
    mockUpsert: vi.fn(),
    mockRotate: vi.fn(),
    mockToggle: vi.fn(),
    scimQuery: { current: { data: undefined as unknown, isLoading: false } },
    ssoQuery: { current: { data: undefined as unknown, isLoading: false } },
  }),
);

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({ scim: { get: { invalidate: vi.fn() } } }),
    scim: {
      get: { useQuery: () => scimQuery.current },
      upsert: {
        useMutation: () => ({
          isPending: false,
          isSuccess: false,
          isError: false,
          mutate: mockUpsert,
        }),
      },
      rotateToken: {
        useMutation: () => ({
          isPending: false,
          isSuccess: false,
          mutate: mockRotate,
        }),
      },
      setEnabled: {
        useMutation: () => ({
          isPending: false,
          isSuccess: false,
          mutate: mockToggle,
        }),
      },
    },
    sso: {
      get: { useQuery: () => ssoQuery.current },
    },
  },
}));

const messages = {
  scim: {
    title: "SCIM Provisioning",
    subtitle:
      "Let your identity provider automatically create, update, and deactivate members in this org via SCIM 2.0.",
    loading: "Loading…",
    notConfigured: "SCIM is not configured for this org yet.",
    ssoRequired: "Configure SSO before enabling SCIM provisioning.",
    ssoRequiredCta: "Go to SSO settings",
    enable: "Enable",
    disable: "Disable",
    enabled: "Enabled",
    disabled: "Disabled",
    save: "Save",
    cancel: "Cancel",
    saved: "Saved.",
    saveError: "Could not save. Check the values and try again.",
    rotateToken: "Rotate token",
    rotateConfirm:
      "Rotating replaces the current bearer token. Update it in your IdP immediately, or provisioning will stop working. Continue?",
    tokenRevealTitle: "New bearer token (shown once)",
    tokenRevealBody:
      "Copy this now and paste it into your identity provider's SCIM configuration. It will not be shown again.",
    fields: {
      tokenPrefix: "Current token",
      roleAttribute: "Role attribute",
      roleAttributeHint:
        'Dot-path into the SCIM user payload used to resolve a role, e.g. "department" or "urn:custom.department".',
      roleValueMap: "Role value map",
      roleValueMapHint:
        'One "attribute-value: role" pair per line, e.g. eng: admin',
      endpointUrl: "SCIM endpoint URL",
    },
  },
};

import { ScimConnectionForm } from "./ScimConnectionForm";

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages as never}>
      <ScimConnectionForm />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockUpsert.mockReset();
  mockRotate.mockReset();
  mockToggle.mockReset();
  scimQuery.current = { data: undefined, isLoading: false };
  ssoQuery.current = { data: undefined, isLoading: false };
});

describe("ScimConnectionForm", () => {
  it("shows the blocked state when neither SSO nor SCIM is configured", () => {
    renderForm();
    expect(
      screen.getByText("Configure SSO before enabling SCIM provisioning."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Go to SSO settings" }),
    ).toBeTruthy();
    // Form fields must not render in the blocked state.
    expect(screen.queryByText("Role attribute")).toBeNull();
    expect(screen.queryByText("SCIM endpoint URL")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renders the form when an SSO connection exists, even with no SCIM connection yet", () => {
    ssoQuery.current = {
      data: {
        orgId: "o1",
        issuer: "https://idp.example.com",
        clientId: "cid",
        buttonLabel: null,
        allowedDomains: [],
        groupRoleMap: null,
        enabled: true,
        hasSecret: true,
        updatedAt: new Date(),
      },
      isLoading: false,
    };
    renderForm();
    expect(screen.getByText("Role attribute")).toBeTruthy();
    expect(
      screen.getByText("SCIM is not configured for this org yet."),
    ).toBeTruthy();
    expect(
      screen.queryByText("Configure SSO before enabling SCIM provisioning."),
    ).toBeNull();
  });

  it("renders the form when a SCIM connection already exists, regardless of current SSO state", () => {
    ssoQuery.current = { data: undefined, isLoading: false };
    scimQuery.current = {
      data: {
        orgId: "o1",
        tokenPrefix: "scim_abc",
        roleAttribute: "department",
        roleValueMap: { eng: "admin" },
        enabled: true,
        updatedAt: new Date(),
      },
      isLoading: false,
    };
    renderForm();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(
      screen.queryByText("Configure SSO before enabling SCIM provisioning."),
    ).toBeNull();
  });

  it("shows the read-only endpoint URL field when the form renders", () => {
    ssoQuery.current = {
      data: {
        orgId: "o1",
        issuer: "https://idp.example.com",
        clientId: "cid",
        buttonLabel: null,
        allowedDomains: [],
        groupRoleMap: null,
        enabled: true,
        hasSecret: true,
        updatedAt: new Date(),
      },
      isLoading: false,
    };
    renderForm();
    expect(screen.getByText("SCIM endpoint URL")).toBeTruthy();
  });

  it("calls scim.upsert on save", () => {
    ssoQuery.current = {
      data: {
        orgId: "o1",
        issuer: "https://idp.example.com",
        clientId: "cid",
        buttonLabel: null,
        allowedDomains: [],
        groupRoleMap: null,
        enabled: true,
        hasSecret: true,
        updatedAt: new Date(),
      },
      isLoading: false,
    };
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("calls scim.setEnabled when toggling Enabled/Disabled", () => {
    ssoQuery.current = { data: undefined, isLoading: false };
    scimQuery.current = {
      data: {
        orgId: "o1",
        tokenPrefix: "scim_abc",
        roleAttribute: "department",
        roleValueMap: { eng: "admin" },
        enabled: true,
        updatedAt: new Date(),
      },
      isLoading: false,
    };
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle.mock.calls[0][0]).toEqual({ enabled: false });
  });
});
