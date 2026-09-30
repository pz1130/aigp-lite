import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable, type DataTableColumn } from "./DataTable";

type Row = { id: string; name: string };
const cols: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", render: (r) => r.name },
];

describe("DataTable", () => {
  it("renders rows", () => {
    render(
      <DataTable
        rows={[{ id: "1", name: "Alpha" }]}
        columns={cols}
        rowKey={(r) => r.id}
        emptyTitle="x"
      />,
    );
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("renders LoadingState when isLoading", () => {
    const { container } = render(
      <DataTable
        rows={undefined}
        isLoading
        columns={cols}
        rowKey={(r) => r.id}
        emptyTitle="x"
      />,
    );
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders EmptyState when rows empty", () => {
    render(
      <DataTable
        rows={[]}
        columns={cols}
        rowKey={(r) => r.id}
        emptyTitle="Nothing here"
        emptyDescription="Add some."
      />,
    );
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders ErrorState when error", () => {
    render(
      <DataTable
        rows={undefined}
        error={{ message: "boom" }}
        columns={cols}
        rowKey={(r) => r.id}
        emptyTitle="x"
      />,
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });
});
