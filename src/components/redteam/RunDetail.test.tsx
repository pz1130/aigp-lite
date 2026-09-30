import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const ev = {
  id: "ev1",
  model: "gpt-4o",
  status: "completed",
  engine: "builtin",
  usecaseId: "uc1",
  totalPrompts: 2,
  passedCount: 1,
  failedCount: 1,
  errorCount: 0,
  findings: [],
  imdaCoverage: "",
};

const mutate = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    redteam: {
      runs: {
        get: {
          useQuery: () => ({ data: ev, isLoading: false, refetch: vi.fn() }),
        },
        linkSystem: { useMutation: () => ({ mutate, isPending: false }) },
      },
    },
    inventory: {
      list: {
        useQuery: () => ({
          data: [
            { id: "uc1", name: "Fraud Scorer" },
            { id: "uc2", name: "Chatbot" },
          ],
        }),
      },
    },
  },
}));

import { RunDetail } from "./RunDetail";

const messages = {
  common: { loading: "Loading" },
  redteam: {
    run: {
      field: {
        total: "Total",
        passed: "Passed",
        failed: "Failed",
        error: "Error",
      },
      abort: "Abort",
      abortConfirm: "Abort this run?",
      viewIncident: "View incident",
    },
    finding: {
      promptRef: "Ref",
      category: "Category",
      severity: "Severity",
      judgment: "Judgment",
      reason: "Reason",
    },
    linkSystem: {
      label: "Link to AI system",
      none: "— None —",
      saved: "Saved",
      error: "Failed to update link",
    },
  },
};

function renderDetail(canWrite: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RunDetail id="ev1" canWrite={canWrite} />
    </NextIntlClientProvider>,
  );
}

describe("RunDetail linked-system selector", () => {
  it("renders the selector when canWrite is true", () => {
    renderDetail(true);
    expect(screen.getByText("Link to AI system")).toBeTruthy();
  });

  it("hides the selector when canWrite is false", () => {
    renderDetail(false);
    expect(screen.queryByText("Link to AI system")).toBeNull();
  });

  it("renders namespaced labels (regression: root-namespace i18n bug)", () => {
    renderDetail(false);
    // These labels used to look up nonexistent top-level keys (run.field.*,
    // finding.*) and render as MISSING_MESSAGE in prod. They must resolve.
    expect(screen.getByText("Total")).toBeTruthy();
    expect(screen.getByText("Passed")).toBeTruthy();
    expect(screen.getByText("Ref")).toBeTruthy();
    expect(screen.getByText("Reason")).toBeTruthy();
  });
});

describe("run detail page i18n keys (regression: MISSING_MESSAGE)", () => {
  // The run detail page (redteam/runs/[id]/page.tsx) renders
  // t("run.detailTitle") under the "redteam" namespace. The key was missing
  // from both catalogs, so the server page threw MISSING_MESSAGE at render.
  it.each(["en", "zh"])("has redteam.run.detailTitle in %s", async (locale) => {
    const messages = (await import(`../../../messages/${locale}.json`)).default;
    const value = messages?.redteam?.run?.detailTitle;
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
  });
});
