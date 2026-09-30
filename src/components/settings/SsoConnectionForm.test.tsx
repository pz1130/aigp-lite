import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const { mockUpsert, mockRotate, getQuery } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockRotate: vi.fn(),
  getQuery: { current: { data: undefined as unknown, isLoading: false } },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({ sso: { get: { invalidate: vi.fn() } } }),
    sso: {
      get: { useQuery: () => getQuery.current },
      upsert: {
        useMutation: () => ({
          isPending: false,
          isSuccess: false,
          isError: false,
          mutate: mockUpsert,
        }),
      },
      rotateSecret: {
        useMutation: () => ({
          isPending: false,
          isSuccess: false,
          mutate: mockRotate,
        }),
      },
    },
  },
}));

const messages = {
  sso: {
    title: "Single Sign-On",
    subtitle: "Configure your org's OIDC connection.",
    loading: "Loading…",
    save: "Save",
    cancel: "Cancel",
    saved: "Saved.",
    saveError: "Could not save.",
    rotate: "Rotate",
    rotateSave: "Save secret",
    rotated: "Secret rotated.",
    disabledNotice: "SSO is currently disabled.",
    fields: {
      issuer: "Issuer URL",
      clientId: "Client ID",
      clientSecret: "Client Secret",
      newSecret: "New secret",
      buttonLabel: "Sign-in button label",
      buttonLabelPlaceholder: "Sign in with SSO",
      allowedDomains: "Allowed email domains",
      allowedDomainsHint: "Comma-separated. Leave blank to allow any.",
      enabled: "Enabled",
    },
  },
};

import { SsoConnectionForm } from "./SsoConnectionForm";

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages as never}>
      <SsoConnectionForm />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockUpsert.mockReset();
  mockRotate.mockReset();
  getQuery.current = { data: undefined, isLoading: false };
});

describe("SsoConnectionForm", () => {
  it("renders the metadata fields", () => {
    renderForm();
    expect(screen.getByText("Issuer URL")).toBeTruthy();
    expect(screen.getByText("Client ID")).toBeTruthy();
    expect(screen.getByText("Sign-in button label")).toBeTruthy();
    expect(screen.getByText("Allowed email domains")).toBeTruthy();
  });

  it("shows a plaintext secret input when no connection exists yet", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Client Secret")).toBeTruthy();
    // No masked display and no Rotate control before a secret is stored.
    expect(screen.queryByText("••••••••")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rotate" })).toBeNull();
  });

  it("masks the stored secret and offers a Rotate control", () => {
    getQuery.current = {
      data: {
        orgId: "o1",
        issuer: "https://idp.example.com",
        clientId: "cid",
        buttonLabel: "Corp SSO",
        allowedDomains: ["corp.com"],
        groupRoleMap: null,
        enabled: true,
        hasSecret: true,
        updatedAt: new Date(),
      },
      isLoading: false,
    };
    renderForm();
    expect(screen.getByText("••••••••")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rotate" })).toBeTruthy();
    // The plaintext secret input is not rendered once a secret is stored.
    expect(screen.queryByPlaceholderText("Client Secret")).toBeNull();
  });

  it("calls sso.upsert with the secret on first-time create", () => {
    renderForm();
    // Fill all required fields so jsdom's constraint validation lets submit through.
    const textboxes = screen.getAllByRole("textbox");
    fireEvent.change(screen.getByPlaceholderText("https://idp.example.com"), {
      target: { value: "https://idp.example.com" },
    });
    // Client ID is the only required text input without a placeholder.
    const clientIdInput = textboxes.find(
      (el) => el.getAttribute("type") !== "url",
    );
    fireEvent.change(clientIdInput!, { target: { value: "cid" } });
    fireEvent.change(screen.getByPlaceholderText("Client Secret"), {
      target: { value: "the-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      issuer: "https://idp.example.com",
      clientSecret: "the-secret",
    });
  });

  it("calls sso.upsert WITHOUT a secret when editing an existing connection", () => {
    getQuery.current = {
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
    expect("clientSecret" in mockUpsert.mock.calls[0][0]).toBe(false);
  });

  it("rotates the secret via sso.rotateSecret", () => {
    getQuery.current = {
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
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.change(screen.getByPlaceholderText("New secret"), {
      target: { value: "rotated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save secret" }));
    expect(mockRotate).toHaveBeenCalledTimes(1);
    expect(mockRotate.mock.calls[0][0]).toEqual({ clientSecret: "rotated" });
  });
});
