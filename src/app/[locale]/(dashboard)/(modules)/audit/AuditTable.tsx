"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page";
import { DataTable, type DataTableColumn } from "@/components/page/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format/intl";
import { Download, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export interface AuditRow {
  id: string;
  ts: Date;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorId: string | null;
  ip: string | null;
}

export function AuditTable({ rows, page, pageSize, total }: AuditTableProps) {
  const t = useTranslations("audit");
  const router = useRouter();

  const columns: DataTableColumn<AuditRow>[] = [
    {
      key: "ts",
      header: t("timestamp"),
      width: "160px",
      render: (row) => (
        <span
          className="whitespace-nowrap font-mono text-xs text-secondary"
          suppressHydrationWarning
        >
          {formatRelative(row.ts, "en")}
        </span>
      ),
    },
    {
      key: "action",
      header: t("action"),
      width: "120px",
      render: (row) => (
        <Badge variant="neutral" size="sm">
          {row.action}
        </Badge>
      ),
    },
    {
      key: "resource",
      header: t("resource"),
      render: (row) => (
        <span className="text-body">
          {row.resourceType}
          {row.resourceId && (
            <span className="ml-1 text-secondary">#{row.resourceId}</span>
          )}
        </span>
      ),
    },
    {
      key: "actor",
      header: t("actor"),
      render: (row) => (
        <span className={row.actorId ? "text-body" : "text-secondary"}>
          {row.actorId ?? "system"}
        </span>
      ),
    },
    {
      key: "ip",
      header: t("ip"),
      render: (row) => (
        <span className="font-mono text-xs text-secondary">
          {row.ip ?? "—"}
        </span>
      ),
    },
  ];

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page * pageSize < total ? page + 1 : null;

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      emptyTitle={t("noLogs")}
      pagination={
        total > pageSize
          ? {
              start,
              end,
              total,
              onPrev: prevPage
                ? () => router.push(`?page=${prevPage}`)
                : undefined,
              onNext: nextPage
                ? () => router.push(`?page=${nextPage}`)
                : undefined,
            }
          : undefined
      }
    />
  );
}

interface AuditTableProps {
  rows: AuditRow[];
  page: number;
  pageSize: number;
  total: number;
}

export function AuditPageClient({
  rows,
  total,
  page,
  pageSize,
  breadcrumb,
}: AuditPageClientProps) {
  const t = useTranslations("audit");

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={breadcrumb}
        action={
          <div className="flex gap-2">
            <Link href="/audit/sinks">
              <Button variant="secondary" size="sm">
                <Send size={14} />
                {t("sinks.title")}
              </Button>
            </Link>
            <a href="/api/audit/export">
              <Button variant="secondary" size="sm">
                <Download size={14} />
                {t("exportCSV")}
              </Button>
            </a>
          </div>
        }
      />
      <AuditTable rows={rows} page={page} pageSize={pageSize} total={total} />
    </>
  );
}

interface AuditPageClientProps {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  breadcrumb?: React.ReactNode;
}
