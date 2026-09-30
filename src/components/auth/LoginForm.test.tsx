import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LoginForm } from "./LoginForm";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { signIn } from "next-auth/react";

const messages = {
  auth: {
    sso: {
      button: "Sign in with SSO",
      divider: "or",
      errors: {
        failed:
          "SSO login failed. Please try again or contact your administrator.",
        denied: "Access denied. Contact your administrator.",
        unknown: "Sign-in failed.",
      },
    },
    login: {
      title: "Sign in",
      subtitle: "Welcome back.",
      showPassword: "Show password",
      hidePassword: "Hide password",
      email: "Email",
      password: "Password",
      submit: "Sign in",
    },
  },
  errors: {
    invalidCredentials: "Invalid email or password.",
    unexpected: "Something went wrong.",
  },
};

function renderForm(props: Partial<Parameters<typeof LoginForm>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginForm {...props} />
    </NextIntlClientProvider>,
  );
}

describe("LoginForm (glass)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockClear();
  });

  it("renders title and subtitle", () => {
    renderForm();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Welcome back.")).toBeTruthy();
  });

  it("never calls window.alert on credential failure", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(signIn).mockResolvedValue({
      error: "CredentialsSignin",
      code: "CredentialsSignin",
      status: 401,
      ok: false,
      url: null,
    });
    renderForm();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Invalid email or password.");
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("shows the 'unexpected' banner when signIn throws", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("network"));
    renderForm();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Something went wrong.");
    });
  });

  it("disables submit while submitting", async () => {
    vi.mocked(signIn).mockImplementation(() => new Promise(() => {})); // never resolves
    renderForm();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    const btn = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(btn);
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(true));
  });

  it("show-password toggle flips input type and updates aria-label", () => {
    renderForm();
    const toggle = screen.getByRole("button", { name: "Show password" });
    const pwd = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pwd.type).toBe("password");
    fireEvent.click(toggle);
    expect(pwd.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(pwd.type).toBe("password");
  });

  it("hides the SSO button when SSO is not enabled", () => {
    renderForm();
    expect(
      screen.queryByRole("button", { name: "Sign in with SSO" }),
    ).toBeNull();
  });

  it("shows the SSO button with a custom label and forwards the org hint", () => {
    renderForm({
      ssoEnabled: true,
      ssoButtonLabel: "Acme SSO",
      orgHint: "acme",
    });
    const btn = screen.getByRole("button", { name: "Acme SSO" });
    fireEvent.click(btn);
    expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/?org=acme" });
  });

  it("redirects to / on successful login", async () => {
    vi.mocked(signIn).mockResolvedValue({
      error: undefined,
      code: undefined,
      status: 200,
      ok: true,
      url: "/",
    });
    renderForm();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });
});
