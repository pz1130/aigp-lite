import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FriaActionsBar } from "./FriaActionsBar";

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    fria: {
      submit: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      withdraw: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      approve: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      supersede: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      archive: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

const messages = {
  fria: {
    selfApproveBlocked: "You cannot approve your own FRIA",
    actions: {
      submit: "Submit for review",
      withdraw: "Withdraw",
      approve: "Approve",
      supersede: "Start new version",
      archive: "Archive",
      exportPdf: "Export PDF",
    },
  },
};

type FriaStatus = "draft" | "submitted" | "approved" | "archived";
type FriaRole = "admin" | "risk_officer" | "ai_owner" | "auditor" | "viewer";

function renderBar(props: {
  status: FriaStatus;
  role: FriaRole;
  isCreator: boolean;
}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FriaActionsBar
        friaId="f1"
        status={props.status}
        userRole={props.role}
        isCreator={props.isCreator}
        onAnyAction={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("FriaActionsBar", () => {
  it("draft + author shows Submit and Export PDF", () => {
    renderBar({ status: "draft", role: "ai_owner", isCreator: true });
    expect(screen.getByText("Submit for review")).toBeTruthy();
    expect(screen.getByText("Export PDF")).toBeTruthy();
    expect(screen.queryByText("Approve")).toBeNull();
  });

  it("submitted + author shows Withdraw, no Approve", () => {
    renderBar({ status: "submitted", role: "ai_owner", isCreator: true });
    expect(screen.getByText("Withdraw")).toBeTruthy();
    expect(screen.queryByText("Approve")).toBeNull();
  });

  it("submitted + risk_officer (not creator) shows Approve enabled", () => {
    renderBar({ status: "submitted", role: "risk_officer", isCreator: false });
    const approve = screen.getByRole("button", { name: /Approve/ });
    expect(approve.hasAttribute("disabled")).toBe(false);
  });

  it("submitted + risk_officer who is also creator shows Approve disabled with tooltip text", () => {
    renderBar({ status: "submitted", role: "risk_officer", isCreator: true });
    const approve = screen.getByRole("button", { name: /Approve/ });
    expect(approve.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("You cannot approve your own FRIA")).toBeTruthy();
  });

  it("approved shows Supersede + Archive + Export PDF", () => {
    renderBar({ status: "approved", role: "risk_officer", isCreator: false });
    expect(screen.getByText("Start new version")).toBeTruthy();
    expect(screen.getByText("Archive")).toBeTruthy();
    expect(screen.getByText("Export PDF")).toBeTruthy();
  });

  it("archived shows only Export PDF", () => {
    renderBar({ status: "archived", role: "risk_officer", isCreator: false });
    expect(screen.getByText("Export PDF")).toBeTruthy();
    expect(screen.queryByText("Submit for review")).toBeNull();
  });
});
