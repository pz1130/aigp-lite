"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { PageHeader, DataTable } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ConnectorRow {
  id: string;
  name: string;
  integrationType: string;
  isActive: boolean;
  healthStatus: string | null;
  lastDeliveryAt: Date | string | null;
  subscribedEvents: string[];
}

function HealthBadge({ status }: { status: string | null }) {
  const t = useTranslations("integrations.connector.health");
  if (!status) return <Badge variant="neutral">{t("never")}</Badge>;
  if (status.startsWith("ok"))
    return <Badge variant="success">{t("ok")}</Badge>;
  return <Badge variant="critical">{t("failed")}</Badge>;
}

export function ConnectorList() {
  const t = useTranslations("integrations.connector");
  const { data, isLoading, error, refetch } =
    trpc.integrationsExt.list.useQuery();
  const rows = (data ?? []) as ConnectorRow[];

  const columns = [
    {
      key: "name",
      header: t("field.name"),
      render: (row: ConnectorRow) => (
        <Link
          href={`/integrations/connectors/${row.id}` as never}
          className="font-medium text-primary hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "integrationType",
      header: t("field.type"),
      render: (row: ConnectorRow) => (
        <span className="font-mono text-xs text-secondary">
          {row.integrationType}
        </span>
      ),
    },
    {
      key: "subscribedEvents",
      header: t("field.subscribedEvents"),
      render: (row: ConnectorRow) => (
        <span className="text-xs text-secondary">
          {row.subscribedEvents.length === 0
            ? t("noSubscriptions")
            : `${row.subscribedEvents.length} events`}
        </span>
      ),
    },
    {
      key: "healthStatus",
      header: t("field.health"),
      render: (row: ConnectorRow) => <HealthBadge status={row.healthStatus} />,
    },
    {
      key: "lastDeliveryAt",
      header: t("field.lastDelivery"),
      render: (row: ConnectorRow) =>
        row.lastDeliveryAt ? (
          <span className="text-xs text-secondary">
            {new Date(row.lastDeliveryAt).toLocaleString()}
          </span>
        ) : (
          <span className="text-xs text-tertiary">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href={"/integrations/connectors/new" as never}>
            <Button variant="primary" size="sm">
              <Plus size={14} />
              {t("new")}
            </Button>
          </Link>
        }
      />

      <DataTable
        rows={rows}
        isLoading={isLoading}
        error={error ? { message: error.message } : null}
        onRetry={refetch}
        columns={columns}
        rowKey={(row) => row.id}
        emptyTitle={t("empty")}
        emptyDescription={t("emptyDescription")}
        emptyAction={
          <Link href={"/integrations/connectors/new" as never}>
            <Button variant="secondary" size="sm">
              {t("addFirst")}
            </Button>
          </Link>
        }
      />
    </>
  );
}
