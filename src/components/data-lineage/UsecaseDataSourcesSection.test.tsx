import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      dataLineage: {
        byUsecase: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    }),
    dataLineage: {
      byUsecase: {
        useQuery: () => ({
          data: [
            {
              usecaseId: "uc1",
              dataSourceId: "ds1",
              direction: "training",
              purpose: "Historical labels",
              dataSource: {
                id: "ds1",
                name: "CRM Export",
                sensitivity: "confidential",
                origin: "first_party",
              },
            },
            {
              usecaseId: "uc1",
              dataSourceId: "ds2",
              direction: "inference_input",
              purpose: "",
              dataSource: {
                id: "ds2",
                name: "Live Feed",
                sensitivity: "internal",
                origin: "first_party",
              },
            },
          ],
        }),
      },
      unlinkUsecase: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      linkUsecase: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
      list: { useQuery: () => ({ data: [] }) },
    },
    inventory: { list: { useQuery: () => ({ data: [] }) } },
  },
}));

import { UsecaseDataSourcesSection } from "./UsecaseDataSourcesSection";

const messages = {
  dataLineage: {
    section: { title: "Data Sources", empty: "none" },
    action: { link: "Link Data Source", unlink: "Remove" },
    direction: {
      training: "Training",
      inference_input: "Inference input",
      inference_output: "Inference output",
    },
    sensitivityLevels: {
      confidential: "Confidential",
      internal: "Internal",
      restricted: "Restricted",
      public: "Public",
    },
    dialog: {
      confirmUnlink: "Remove?",
      dataSource: "Data source",
      usecase: "Use case",
      searchPlaceholder: "Search…",
      noResults: "No results",
      direction: "Direction",
      purpose: "Purpose",
      purposeLabel: "purpose",
      cancel: "Cancel",
      submit: "Link",
    },
  },
};

describe("UsecaseDataSourcesSection", () => {
  it("renders grouped rows by direction", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <UsecaseDataSourcesSection usecaseId="uc1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Training")).toBeTruthy();
    expect(screen.getByText("Inference input")).toBeTruthy();
    expect(screen.getByText("CRM Export")).toBeTruthy();
    expect(screen.getByText("Live Feed")).toBeTruthy();
    expect(screen.getByText("Confidential")).toBeTruthy();
  });
});
