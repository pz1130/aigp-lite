"use client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Upload } from "lucide-react";
import { ControlDialog } from "./ControlDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ImportDialog } from "./ImportDialog";

interface Control {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface Props {
  frameworkId: string;
  frameworkCode: string;
  controls: Control[];
  canWrite: boolean;
  canDelete: boolean;
}

const severityToVariant = (
  level: string,
): "danger" | "warn" | "success" | "critical" => {
  if (level === "critical") return "critical";
  if (level === "high") return "danger";
  if (level === "medium") return "warn";
  return "success";
};

export function FrameworkDetailClient({
  frameworkId,
  frameworkCode,
  controls,
  canWrite,
  canDelete,
}: Props) {
  const t = useTranslations("risk");
  const router = useRouter();
  const utils = trpc.useUtils();
  const remove = trpc.risk.controlDelete.useMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Control | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Control | null>(null);

  function openAdd() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function handleDelete(e: React.MouseEvent, c: Control) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(c);
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setImportOpen(true)}
          >
            <Upload size={14} className="mr-1" />
            {t("importControls")}
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus size={14} className="mr-1" />
            {t("addControl")}
          </Button>
        </div>
      )}

      <Table>
        <THead>
          <Tr>
            <Th className="w-28">{t("code")}</Th>
            <Th>{t("control")}</Th>
            <Th className="w-24">{t("severityLabel")}</Th>
            <Th>{t("description")}</Th>
            {canDelete && <Th className="w-12" />}
          </Tr>
        </THead>
        <TBody>
          {controls.map((c) => (
            <Tr
              key={c.id}
              className="cursor-pointer hover:bg-subtle/50"
              onClick={() =>
                router.push(
                  `/risk/frameworks/${frameworkCode}/controls/${c.code}` as Parameters<
                    typeof router.push
                  >[0],
                )
              }
            >
              <Td className="font-mono text-xs">{c.code}</Td>
              <Td className="font-medium text-primary">{c.title}</Td>
              <Td>
                <Badge size="sm" variant={severityToVariant(c.severity)}>
                  {t(`severity.${c.severity}`)}
                </Badge>
              </Td>
              <Td
                className="text-secondary max-w-sm truncate"
                title={c.description}
              >
                {c.description}
              </Td>
              {canDelete && (
                <Td>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleDelete(e, c)}
                  >
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </Table>

      {controls.length === 0 && (
        <p className="py-8 text-center text-secondary">{t("noControls")}</p>
      )}

      <ControlDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        frameworkId={frameworkId}
        control={editing}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        frameworkId={frameworkId}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("deleteControlConfirm")}
        confirmLabel={t("deleteFramework")}
        variant="danger"
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              await remove.mutateAsync({ id: deleteTarget.id });
              await utils.risk.frameworks.invalidate();
              router.refresh();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "";
              if (
                msg.includes("PRECONDITION_FAILED") ||
                msg.includes("use case statuses")
              ) {
                alert(t("controlHasStatuses"));
              } else {
                alert(msg || "Delete failed");
              }
            }
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
