"use client";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { DataTable, type DataTableColumn } from "@/components/page/DataTable";
import { formatRelative } from "@/lib/format/intl";

type WorkflowInstance = {
  id: string;
  template: string;
  currentStep: number;
  createdAt: Date;
  usecase: { id: string; name: string };
  steps: {
    stepIndex: number;
    stepName: string;
    assigneeRole: string | null;
    assigneeUserId: string | null;
    decision: string;
    decidedAt: Date | null;
  }[];
};

export function WorkflowTable({
  rows,
  locale,
}: {
  rows: WorkflowInstance[];
  locale: string;
}) {
  const t = useTranslations("workflow");

  const columns: DataTableColumn<WorkflowInstance>[] = [
    {
      key: "usecase",
      header: t("col.usecase"),
      render(row) {
        return (
          <div>
            <Link
              href={`/workflow/${row.id}`}
              className="font-medium text-accent underline hover:text-accent-hover"
            >
              {row.usecase.name}
            </Link>
            <p className="text-small text-secondary">
              {t("template")}: {row.template}
            </p>
          </div>
        );
      },
    },
    {
      key: "actor",
      header: t("col.actor"),
      width: "180px",
      render(row) {
        const currentStep = row.steps[row.currentStep];
        return currentStep ? (
          <span className="text-small text-secondary" suppressHydrationWarning>
            {currentStep.assigneeRole
              ? currentStep.assigneeRole.replace(/_/g, " ")
              : "—"}
          </span>
        ) : null;
      },
    },
    {
      key: "stage",
      header: t("col.stage"),
      width: "200px",
      align: "center",
      render(row) {
        return (
          <div className="flex items-center justify-center gap-1.5">
            {row.steps.map((step) => (
              <div
                key={step.stepIndex}
                className={`h-2 w-2 rounded-full ${
                  step.decision === "approved"
                    ? "bg-success"
                    : step.decision === "rejected"
                      ? "bg-danger"
                      : step.decision === "requested_changes"
                        ? "bg-warn"
                        : "bg-muted"
                }`}
              />
            ))}
            <span className="ml-1 text-small text-secondary">
              {row.currentStep + 1}/{row.steps.length}
            </span>
          </div>
        );
      },
    },
    {
      key: "updatedAt",
      header: t("col.updatedAt"),
      width: "120px",
      align: "right",
      render(row) {
        const latestStep = row.steps.find((s) => s.decidedAt);
        const date = latestStep?.decidedAt ?? row.createdAt;
        return (
          <span className="text-small text-secondary">
            {formatRelative(new Date(date), locale)}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      onRowClick={(_row) => {}}
      emptyTitle={t("empty.title")}
      emptyDescription={t("empty.description")}
    />
  );
}
