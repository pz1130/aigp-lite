"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { AgentTestingHint } from "@/components/governance/AgentTestingHint";

export function ProviderConnectionList() {
  const t = useTranslations();
  const q = trpc.providerConnection.list.useQuery();
  const utils = trpc.useUtils();
  const remove = trpc.providerConnection.delete.useMutation({
    onSuccess: () => utils.providerConnection.list.invalidate(),
  });
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  if (q.isLoading) return <p>{t("common.loading")}</p>;
  const rows = q.data ?? [];

  function statusLabel(row: {
    lastValidationStatus?: string | null;
    config?: unknown;
  }) {
    const cfg =
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {};
    const state =
      cfg.circuitState && typeof cfg.circuitState === "object"
        ? (cfg.circuitState as Record<string, unknown>)
        : {};
    const openedUntil =
      typeof state.openedUntil === "string" ? state.openedUntil : null;
    if (openedUntil && new Date(openedUntil).getTime() > Date.now())
      return {
        label: t("provider.reliability.circuitOpen"),
        className: "text-warn",
      };
    return {
      label: row.lastValidationStatus ?? "never",
      className: row.lastValidationStatus?.startsWith("ok")
        ? "text-success"
        : row.lastValidationStatus
          ? "text-danger"
          : "text-tertiary",
    };
  }

  function handleDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href="/integrations/providers/new">
          <Button>{t("provider.connection.new")}</Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <AgentTestingHint layer="connect" />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t("provider.field.name")}</Th>
              <Th>{t("provider.field.type")}</Th>
              <Th>{t("provider.field.status")}</Th>
              <Th>{t("provider.field.lastValidated")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link
                    href={`/integrations/providers/${r.id}` as never}
                    className="underline"
                  >
                    {r.name}
                  </Link>
                </Td>
                <Td className="font-mono text-xs">{r.providerType}</Td>
                <Td>
                  {(() => {
                    const status = statusLabel(r);
                    return (
                      <span className={status.className}>{status.label}</span>
                    );
                  })()}
                </Td>
                <Td className="text-tertiary">
                  {r.lastValidatedAt
                    ? new Date(r.lastValidatedAt).toLocaleString()
                    : "—"}
                </Td>
                <Td className="text-right">
                  <div className="inline-flex gap-1">
                    <Link
                      href={`/integrations/providers/${r.id}` as never}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                      title={t("common.edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-tertiary hover:text-danger"
                      title={t("common.delete")}
                      onClick={() => handleDelete(r.id, r.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("provider.connection.deleteConfirm")}
        confirmLabel={t("common.delete")}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            remove.mutate({ id: deleteTarget.id });
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
