"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";

interface Props {
  frameworkId: string;
  initialDescription: string;
  canWrite: boolean;
}

export function FrameworkDescriptionEditor({
  frameworkId,
  initialDescription,
  canWrite,
}: Props) {
  const t = useTranslations("risk");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialDescription);
  const utils = trpc.useUtils();
  const update = trpc.risk.frameworkUpdate.useMutation({
    onSuccess: () => {
      utils.risk.frameworks.invalidate();
      setEditing(false);
    },
  });

  if (!canWrite && !initialDescription) return null;

  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        <p className="text-sm text-secondary whitespace-pre-wrap flex-1">
          {initialDescription || (
            <span className="italic">{t("noDescription")}</span>
          )}
        </p>
        {canWrite && (
          <Button
            size="sm"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        placeholder={t("descriptionPlaceholder")}
        autoFocus
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => update.mutate({ id: frameworkId, description: value })}
          disabled={update.isPending}
        >
          <Check size={14} className="mr-1" />
          {t("saveDescription")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setValue(initialDescription);
            setEditing(false);
          }}
        >
          <X size={14} className="mr-1" />
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
