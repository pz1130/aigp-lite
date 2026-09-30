"use client";
import { trpc } from "@/lib/trpc/client";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { PageHeader, DataTable } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CATALOG } from "@/lib/integrations-ext/catalog";

export default function IntegrationsPage() {
  const t = useTranslations("integrations");
  const tRoot = useTranslations();
  const tConn = useTranslations("integrations.connector");
  const {
    data: webhooks,
    isLoading,
    error,
    refetch,
  } = trpc.integrations.listWebhooks.useQuery();
  const { data: connectors } = trpc.integrationsExt.list.useQuery();

  const columns: {
    key: string;
    header: string;
    width?: string;
    align?: "left" | "right" | "center";
    render: (row: {
      id: string;
      url: string;
      events: unknown;
      enabled: boolean;
    }) => React.ReactNode;
  }[] = [
    {
      key: "url",
      header: t("url"),
      render: (row) => (
        <span className="truncate max-w-xs text-primary">{row.url}</span>
      ),
    },
    {
      key: "events",
      header: t("events"),
      render: (row) => (
        <span className="text-xs text-secondary">
          {Array.isArray(row.events) ? row.events.join(", ") : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      render: (row) => (
        <Badge variant={row.enabled ? "success" : "neutral"} size="sm">
          {row.enabled ? t("active") : t("disabled")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      align: "right",
      render: (row) => (
        <Link href={`/integrations/${row.id}`}>
          <Button variant="secondary" size="sm">
            {t("manage")}
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        description="Webhook endpoints for real-time events"
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={
          <Link href="/integrations/new">
            <Button variant="primary" size="sm">
              <Plus size={14} />
              {t("new")}
            </Button>
          </Link>
        }
      />

      <DataTable
        rows={webhooks}
        isLoading={isLoading}
        error={error ? { message: error.message } : null}
        onRetry={refetch}
        columns={columns}
        rowKey={(row) => row.id}
        emptyTitle={t("empty")}
        emptyDescription="Register a URL to receive real-time AIGP events."
        emptyAction={
          <Link href="/integrations/new">
            <Button variant="secondary" size="sm">
              {t("addFirst")}
            </Button>
          </Link>
        }
      />

      <section className="rounded-lg border border-border-default bg-surface p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-primary">
              {tConn("title")}
            </h2>
            <p className="mt-0.5 text-small text-secondary">
              {tConn("description")}
            </p>
          </div>
          <Link href="/integrations/connectors">
            <Button variant="secondary" size="sm">
              {tConn("manageAll")}
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {CATALOG.map((entry) => {
            const existing =
              connectors?.filter(
                (c) => c.integrationType === entry.integrationType,
              ) ?? [];
            return (
              <Link
                key={entry.integrationType}
                href={`/integrations/connectors/new?type=${entry.integrationType}`}
                className="flex flex-col gap-2 rounded-md border border-border-default bg-muted px-4 py-3 transition hover:bg-surface"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-primary">
                    {tRoot(entry.displayNameKey)}
                  </span>
                  {existing.length > 0 && (
                    <Badge variant="success" size="sm">
                      {existing.length}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-secondary">
                  {tRoot(entry.descriptionKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
