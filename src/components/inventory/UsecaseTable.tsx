"use client";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import type { AiUsecase } from "@/lib/prisma";
import { DataTable, type DataTableColumn } from "@/components/page/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format/intl";
import { AgentTestingHint } from "@/components/governance/AgentTestingHint";

type ClassificationSummary = {
  euAiActCategory: string | null;
  dataSensitivity: string | null;
  confidence: number | null;
  generatedAt: Date | string | null;
};

export type UsecaseTableRow = Pick<
  AiUsecase,
  | "id"
  | "name"
  | "autonomyLevel"
  | "lifecycleStage"
  | "ownerId"
  | "updatedAt"
  | "createdAt"
> & {
  classification?: ClassificationSummary | null;
};

const EU_VARIANT: Record<string, "danger" | "warn" | "neutral" | "success"> = {
  prohibited: "danger",
  high: "danger",
  limited: "warn",
  minimal: "success",
  unknown: "neutral",
};

export function UsecaseTable({
  rows,
  locale,
}: {
  rows: UsecaseTableRow[];
  locale: string;
}) {
  const t = useTranslations("inventory");
  const tCls = useTranslations("inventory.classification");

  const columns: DataTableColumn<UsecaseTableRow>[] = [
    {
      key: "name",
      header: t("fields.name"),
      width: "2fr",
      render: (r) => (
        <Link href={`/inventory/${r.id}`} className="text-accent underline">
          {r.name}
        </Link>
      ),
    },
    {
      key: "autonomy",
      header: t("fields.autonomyLevel"),
      width: "1.5fr",
      render: (r) => t(`autonomy.${r.autonomyLevel}`),
    },
    {
      key: "lifecycle",
      header: t("fields.lifecycleStage"),
      width: "1fr",
      render: (r) => (
        <Badge
          variant={
            r.lifecycleStage === "production"
              ? "success"
              : r.lifecycleStage === "deprecated"
                ? "warn"
                : "neutral"
          }
        >
          {t(`stages.${r.lifecycleStage}`)}
        </Badge>
      ),
    },
    {
      key: "aiAnalysis",
      header: t("col.aiAnalysis"),
      width: "1.5fr",
      render: (r) => {
        const c = r.classification;
        if (!c) return <span className="text-tertiary text-small">—</span>;
        const eu = c.euAiActCategory ?? "unknown";
        return (
          <div className="flex items-center gap-1.5">
            <Badge variant={EU_VARIANT[eu] ?? "neutral"} size="sm">
              {tCls(`euAct.${eu}`)}
            </Badge>
            {c.dataSensitivity && (
              <Badge
                variant={c.dataSensitivity === "high" ? "warn" : "neutral"}
                size="sm"
              >
                {tCls(`sensitivity.${c.dataSensitivity}`)}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "updatedAt",
      header: t("col.lastUpdated"),
      width: "1fr",
      render: (r) => (
        <span className="text-secondary" suppressHydrationWarning>
          {formatRelative(new Date(r.updatedAt ?? r.createdAt), locale)}
        </span>
      ),
    },
  ];

  if (rows.length === 0) {
    return <AgentTestingHint layer="compliance" />;
  }

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      emptyTitle={t("noUsecases")}
      emptyDescription={t("noUsecasesHint")}
    />
  );
}
