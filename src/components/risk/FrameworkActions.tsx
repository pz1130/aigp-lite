"use client";
import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2 } from "lucide-react";

interface Props {
  fwId: string;
  canDelete: boolean;
}

export function FrameworkActions({ fwId, canDelete }: Props) {
  const t = useTranslations("risk");
  const router = useRouter();
  const remove = trpc.risk.frameworkDelete.useMutation({
    onSuccess: () => router.push("/risk"),
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleDelete() {
    setShowDeleteConfirm(true);
  }

  return (
    <div className="flex gap-2">
      {canDelete && (
        <Button
          size="sm"
          variant="danger"
          onClick={handleDelete}
          disabled={remove.isPending}
        >
          <Trash2 size={14} className="mr-1" />
          {t("deleteFramework")}
        </Button>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("deleteFrameworkConfirm")}
        confirmLabel={t("deleteFramework")}
        variant="danger"
        onConfirm={() => {
          remove.mutate({ id: fwId });
          setShowDeleteConfirm(false);
        }}
      />
    </div>
  );
}
