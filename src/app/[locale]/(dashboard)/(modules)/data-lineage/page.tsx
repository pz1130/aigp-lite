"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Link } from "@/i18n/routing";
import { PageHeader, DataTable } from "@/components/page";
import { Badge } from "@/components/ui/badge";

const SENSITIVITY_VARIANT: Record<
  string,
  "danger" | "warn" | "info" | "neutral"
> = {
  restricted: "danger",
  confidential: "warn",
  internal: "info",
  public: "neutral",
};

export default function DataLineagePage() {
  const t = useTranslations("dataLineage");
  const {
    data: sources,
    isLoading,
    error,
    refetch,
  } = trpc.dataLineage.list.useQuery();

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link
            href="/data-lineage/new"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 h-9 text-body font-medium text-inverse hover:bg-accent-hover"
          >
            {t("new")}
          </Link>
        }
      />

      <DataTable
        rows={sources}
        isLoading={isLoading}
        error={error ?? undefined}
        onRetry={refetch}
        rowKey={(row) => row.id}
        onRowClick={(row) => {
          window.location.href = `/data-lineage/${row.id}`;
        }}
        columns={[
          {
            key: "name",
            header: t("name"),
            render: (row) => (
              <div>
                <div className="font-medium">{row.name}</div>
                {row.description && (
                  <div className="text-xs text-secondary">
                    {row.description}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "sensitivity",
            header: t("sensitivity"),
            render: (row) => (
              <Badge
                variant={SENSITIVITY_VARIANT[row.sensitivity] ?? "neutral"}
                size="sm"
              >
                {t(`sensitivityLevels.${row.sensitivity}`)}
              </Badge>
            ),
          },
          {
            key: "origin",
            header: t("origin"),
            render: (row) => (
              <span className="text-secondary text-small">
                {row.origin.replace("_", " ")}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            width: "80px",
            align: "right",
            render: (row) => (
              <Link
                href={`/data-lineage/${row.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border-default bg-surface h-7 px-2.5 text-xs font-medium text-primary hover:bg-muted"
              >
                {t("view")}
              </Link>
            ),
          },
        ]}
        emptyTitle={t("empty")}
        emptyDescription={t("addFirst")}
        emptyAction={
          <Link
            href="/data-lineage/new"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 h-9 text-body font-medium text-inverse hover:bg-accent-hover"
          >
            {t("new")}
          </Link>
        }
      />
    </>
  );
}
