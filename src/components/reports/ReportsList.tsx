"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { GenerateDialog } from "./GenerateDialog";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

export function ReportsList() {
  const t = useTranslations();
  const q = trpc.reports.list.useQuery({});
  const del = trpc.reports.delete.useMutation();
  const utils = trpc.useUtils();
  const [showGenerate, setShowGenerate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (q.isLoading)
    return <p className="text-sm text-tertiary">{t("common.loading")}</p>;
  const rows = q.data?.items ?? [];

  async function onDelete(id: string) {
    setDeleteTarget(id);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setShowGenerate(true)}>
          {t("reports.generate")}
        </Button>
      </div>
      {showGenerate && (
        <GenerateDialog
          onClose={() => {
            setShowGenerate(false);
            void utils.reports.list.invalidate();
          }}
        />
      )}
      {rows.length === 0 ? (
        <div className="rounded-md border border-border-default p-4 text-sm text-tertiary">
          {t("reports.empty")}
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t("reports.field.template")}</Th>
              <Th>{t("reports.field.period")}</Th>
              <Th>{t("reports.field.generatedAt")}</Th>
              <Th>{t("reports.field.actions")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>{r.templateId}</Td>
                <Td>
                  {new Date(r.periodStart).toISOString().slice(0, 10)} –{" "}
                  {new Date(r.periodEnd).toISOString().slice(0, 10)}
                </Td>
                <Td className="text-tertiary">
                  {new Date(r.generatedAt).toLocaleString()}
                </Td>
                <Td className="space-x-2">
                  {r.pdfFileKey && (
                    <a
                      href={`/api/reports/${r.id}/pdf`}
                      className="underline text-secondary"
                    >
                      PDF
                    </a>
                  )}
                  {r.excelFileKey && (
                    <a
                      href={`/api/reports/${r.id}/xlsx`}
                      className="underline text-secondary"
                    >
                      Excel
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:underline"
                    onClick={() => onDelete(r.id)}
                  >
                    {t("common.delete")}
                  </Button>
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
        title={t("reports.deleteConfirm")}
        confirmLabel={t("common.delete")}
        variant="danger"
        onConfirm={async () => {
          if (deleteTarget) {
            await del.mutateAsync({ id: deleteTarget });
            await utils.reports.list.invalidate();
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
