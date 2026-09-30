import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { IncidentsTable, type IncidentRow } from "./IncidentsTable";

const NOW = new Date("2026-05-24T12:00:00.000Z").getTime();

beforeAll(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

const messages = {
  incident: {
    status: {
      open: "Open",
      investigating: "Investigating",
      mitigated: "Mitigated",
      closed: "Closed",
    },
    severity: {
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical",
    },
    category: {
      hijack: "Hijack",
      capability_breach: "Capability breach",
      data_leak: "Data leak",
      trust_failure: "Trust failure",
      cascade: "Cascade",
      audit_failure: "Audit failure",
      resource_abuse: "Resource abuse",
      bias_harm: "Bias harm",
      policy_bypass: "Policy bypass",
      unclassified: "Unclassified",
    },
    sla: {
      dueIn: "Due in",
      overdueBy: "Overdue by",
      imminent: "Imminent",
      ok: "On track",
    },
    form: {
      relatedUsecase: "Related use case",
    },
  },
};

function row(overrides: Partial<IncidentRow> = {}): IncidentRow {
  return {
    id: "i1",
    title: "Test incident",
    severity: "high",
    status: "open",
    category: null,
    slaDeadline: null,
    rootCause: null,
    openedAt: new Date(NOW - 60_000),
    closedAt: null,
    openedBy: { name: "u" },
    closedBy: null,
    usecase: null,
    mergedIntoId: null,
    autoCreatedFromPolicyEvalId: null,
    ...overrides,
  };
}

function renderWith(rows: IncidentRow[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <IncidentsTable incidents={rows} />
    </NextIntlClientProvider>,
  );
}

describe("IncidentsTable", () => {
  it("renders P-code prefix on severity badge", () => {
    renderWith([row({ severity: "critical" })]);
    expect(screen.getByText(/P0/)).toBeTruthy();
  });

  it("renders category badge when category is set", () => {
    renderWith([row({ category: "hijack" })]);
    expect(screen.getByText("Hijack")).toBeTruthy();
  });

  it("does NOT render category badge when category is null", () => {
    renderWith([row({ category: null })]);
    expect(screen.queryByText(/Hijack|Capability|Unclassified/)).toBeNull();
  });

  it("shows 'Due in 2h' when slaDeadline is 2h ahead and status=open", () => {
    renderWith([
      row({ slaDeadline: new Date(NOW + 2 * 3600_000), status: "open" }),
    ]);
    expect(screen.getByText(/Due in 2h/)).toBeTruthy();
  });

  it("shows 'Overdue by 3h' when slaDeadline is 3h past and status=investigating", () => {
    renderWith([
      row({
        slaDeadline: new Date(NOW - 3 * 3600_000),
        status: "investigating",
      }),
    ]);
    expect(screen.getByText(/Overdue by 3h/)).toBeTruthy();
  });

  it("does NOT show SLA line for status=closed", () => {
    renderWith([
      row({ slaDeadline: new Date(NOW + 2 * 3600_000), status: "closed" }),
    ]);
    expect(screen.queryByText(/Due in|Overdue by/)).toBeNull();
  });

  it("does NOT show SLA line when slaDeadline is null", () => {
    renderWith([row({ slaDeadline: null })]);
    expect(screen.queryByText(/Due in|Overdue by/)).toBeNull();
  });
});
