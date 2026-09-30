import { type ReactNode } from "react";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { Button } from "@/components/ui/button";
import { Inbox } from "lucide-react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: string; // CSS width e.g. "120px" or "1fr"
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  rows: T[] | undefined;
  isLoading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  columns: DataTableColumn<T>[];
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pagination?: {
    start: number;
    end: number;
    total: number;
    onPrev?: () => void;
    onNext?: () => void;
  };
}

export function DataTable<T>(props: DataTableProps<T>) {
  if (props.isLoading)
    return <LoadingState rows={5} columns={props.columns.length} />;
  if (props.error)
    return (
      <ErrorState
        title="Failed to load"
        description={props.error.message}
        onRetry={props.onRetry}
      />
    );
  if (!props.rows || props.rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={props.emptyTitle}
        description={props.emptyDescription}
        action={props.emptyAction}
      />
    );
  }
  return (
    <>
      <Table>
        <THead>
          <Tr>
            {props.columns.map((c) => (
              <Th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={c.align === "right" ? "text-right" : ""}
              >
                {c.header}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {props.rows.map((r) => (
            <Tr
              key={props.rowKey(r)}
              className={props.onRowClick ? "cursor-pointer" : ""}
              onClick={
                props.onRowClick ? () => props.onRowClick!(r) : undefined
              }
              tabIndex={props.onRowClick ? 0 : undefined}
              onKeyDown={
                props.onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        props.onRowClick!(r);
                      }
                    }
                  : undefined
              }
              role={props.onRowClick ? "row" : undefined}
            >
              {props.columns.map((c) => (
                <Td
                  key={c.key}
                  className={c.align === "right" ? "text-right" : ""}
                >
                  {c.render(r)}
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
      {props.pagination && (
        <div className="mt-3 flex items-center justify-between text-small text-secondary">
          <span>
            Showing {props.pagination.start}–{props.pagination.end} of{" "}
            {props.pagination.total}
          </span>
          <div className="flex gap-2">
            {props.pagination.onPrev && (
              <Button
                variant="secondary"
                size="sm"
                onClick={props.pagination.onPrev}
              >
                Prev
              </Button>
            )}
            {props.pagination.onNext && (
              <Button
                variant="secondary"
                size="sm"
                onClick={props.pagination.onNext}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
