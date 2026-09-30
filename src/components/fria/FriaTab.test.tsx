import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FriaTab } from "./FriaTab";
import type { UsecaseFria } from "@/lib/prisma";

type FriaSummary = Pick<
  UsecaseFria,
  "id" | "title" | "version" | "status" | "updatedAt" | "archivedAt"
>;
type FriaList = { current: FriaSummary | null; history: FriaSummary[] };
const state: { data: FriaList; isLoading: boolean } = {
  data: { current: null, history: [] },
  isLoading: false,
};

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    fria: {
      listForUsecase: { useQuery: () => state },
    },
  },
}));

const messages = {
  fria: {
    title: "Fundamental Rights Impact Assessment",
    startNew: "Start FRIA",
    loading: "Loading…",
    history: "History",
    updatedAt: "Updated",
    emptyHint: "No FRIA started for this usecase yet.",
    status: {
      draft: "Draft",
      submitted: "Submitted",
      approved: "Approved",
      archived: "Archived",
    },
  },
};

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FriaTab usecaseId="u1" />
    </NextIntlClientProvider>,
  );
}

describe("FriaTab", () => {
  it("renders Start FRIA when none exists", () => {
    state.data = { current: null, history: [] };
    setup();
    expect(screen.getByText("Start FRIA")).toBeTruthy();
    expect(screen.getByText(/No FRIA started/i)).toBeTruthy();
  });

  it("renders current FRIA with status badge", () => {
    state.data = {
      current: {
        id: "f1",
        title: "Current",
        version: 2,
        status: "draft",
        updatedAt: new Date(),
        archivedAt: null,
      },
      history: [],
    };
    setup();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("shows history collapsed; expands to list", () => {
    state.data = {
      current: null,
      history: [
        {
          id: "f0",
          title: "Old",
          version: 1,
          status: "archived",
          updatedAt: new Date(),
          archivedAt: new Date(),
        },
      ],
    };
    setup();
    const sum = screen.getByText(/History/);
    expect(sum).toBeTruthy();
    fireEvent.click(sum);
    expect(screen.getByText(/v1/)).toBeTruthy();
  });
});
