"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { AuditSinkForm } from "./AuditSinkForm";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

export function AuditSinkList() {
  const t = useTranslations("audit.sinks");
  const tCommon = useTranslations("common");
  const utils = trpc.useUtils();

  const { data: sinks, isLoading } = trpc.auditSink.list.useQuery();
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const remove = trpc.auditSink.delete.useMutation({
    onSuccess: () => utils.auditSink.list.invalidate(),
  });

  const test = trpc.auditSink.test.useMutation();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  function handleEdit(id: string) {
    setEditId(id);
    setFormOpen(true);
  }

  function handleCreate() {
    setEditId(null);
    setFormOpen(true);
  }

  function handleDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  async function handleTest(id: string) {
    const result = await test.mutateAsync({ id });
    alert(result.ok ? t("testSuccess") : `${t("testFailed")}: ${result.error}`);
  }

  if (isLoading) return <p className="text-secondary">{tCommon("loading")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">{t("description")}</p>
        <Button size="sm" onClick={handleCreate}>
          <Plus size={14} />
          {t("add")}
        </Button>
      </div>

      {sinks && sinks.length === 0 && (
        <EmptyState
          icon="activity"
          title={t("empty")}
          description={t("emptyHint")}
        />
      )}

      {sinks && sinks.length > 0 && (
        <Table>
          <THead>
            <Tr>
              <Th>{t("col.name")}</Th>
              <Th>{t("col.type")}</Th>
              <Th>{t("col.endpoint")}</Th>
              <Th>{t("col.status")}</Th>
              <Th className="text-right">{tCommon("actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {sinks.map((sink) => (
              <Tr key={sink.id}>
                <Td className="font-medium">{sink.name}</Td>
                <Td>
                  <Badge variant="info" size="sm">
                    {t(`type.${sink.type}`)}
                  </Badge>
                </Td>
                <Td className="text-xs font-mono text-secondary">
                  {sink.type === "datadog"
                    ? sink.url || "http-intake.logs.datadoghq.com"
                    : sink.type === "webhook"
                      ? sink.url
                      : `${sink.host}:${sink.port}/${sink.protocol}`}
                </Td>
                <Td>
                  <Badge
                    variant={sink.enabled ? "success" : "neutral"}
                    size="sm"
                  >
                    {sink.enabled ? t("enabled") : t("disabled")}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(sink.id)}
                      disabled={test.isPending}
                      className="text-tertiary hover:text-secondary"
                      title={t("test")}
                    >
                      <Zap size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(sink.id)}
                      className="text-tertiary hover:text-secondary"
                      title={tCommon("edit")}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(sink.id, sink.name)}
                      disabled={remove.isPending}
                      className="text-danger hover:text-danger"
                      title={tCommon("delete")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <AuditSinkForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editId={editId}
        onSaved={() => utils.auditSink.list.invalidate()}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget ? t("deleteConfirm", { name: deleteTarget.name }) : ""
        }
        confirmLabel={tCommon("delete")}
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
