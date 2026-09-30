import { describe, it, expect, vi } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FriaSectionsForm } from "./FriaSectionsForm";

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    fria: {
      updateSections: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
        }),
      },
    },
  },
}));

const messages = {
  fria: {
    saving: "Saving…",
    saved: "Saved",
    sections: {
      system: "1. System Identification",
      purpose: "2. Purpose and Intended Use",
      rights: "3. Fundamental Rights Assessment",
      governanceControls: "4. Governance Controls Mapping",
      overallRisk: "5. Overall Risk Assessment",
      mitigationPlan: "6. Mitigation Plan",
      consultations: "7. Consultation Record",
      signOff: "8. Sign-Off",
      reviewSchedule: "9. Review and Update",
    },
    rights: {
      humanDignity: "Human Dignity (Art. 1)",
      nonDiscrimination: "Non-Discrimination (Art. 21)",
      privacy: "Privacy & Data Protection (Art. 7-8)",
      effectiveRemedy: "Effective Remedy (Art. 47)",
      freeExpression: "Free Expression (Art. 11)",
      education: "Education (Art. 14)",
      workersRights: "Workers' Rights (Art. 31)",
      childrenRights: "Children's Rights (Art. 24)",
    },
  },
};

function setup(opts: Partial<ComponentProps<typeof FriaSectionsForm>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FriaSectionsForm
        friaId="f1"
        initial={opts.initial ?? { system: { name: "" } }}
        readOnly={opts.readOnly ?? false}
      />
    </NextIntlClientProvider>,
  );
}

describe("FriaSectionsForm", () => {
  it("renders all 9 section titles", () => {
    setup();
    expect(screen.getByText("1. System Identification")).toBeTruthy();
    expect(screen.getByText("2. Purpose and Intended Use")).toBeTruthy();
    expect(screen.getByText("3. Fundamental Rights Assessment")).toBeTruthy();
    expect(screen.getByText("4. Governance Controls Mapping")).toBeTruthy();
    expect(screen.getByText("5. Overall Risk Assessment")).toBeTruthy();
    expect(screen.getByText("6. Mitigation Plan")).toBeTruthy();
    expect(screen.getByText("7. Consultation Record")).toBeTruthy();
    expect(screen.getByText("8. Sign-Off")).toBeTruthy();
    expect(screen.getByText("9. Review and Update")).toBeTruthy();
  });

  it("renders all 8 right keys", () => {
    setup();
    expect(screen.getByText(/Human Dignity/)).toBeTruthy();
    expect(screen.getByText(/Non-Discrimination/)).toBeTruthy();
    expect(screen.getByText(/Privacy & Data Protection/)).toBeTruthy();
    expect(screen.getByText(/Effective Remedy/)).toBeTruthy();
    expect(screen.getByText(/Free Expression/)).toBeTruthy();
    expect(screen.getByText(/Education \(Art\. 14\)/)).toBeTruthy();
    expect(screen.getByText(/Workers' Rights/)).toBeTruthy();
    expect(screen.getByText(/Children's Rights/)).toBeTruthy();
  });

  it("disables all inputs in readOnly mode", () => {
    setup({ readOnly: true });
    const nameInput = screen.getByLabelText(/System name/i) as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
  });

  it("system name input reflects state changes", () => {
    setup();
    const nameInput = screen.getByLabelText(/System name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Hello" } });
    expect(nameInput.value).toBe("Hello");
  });
});
