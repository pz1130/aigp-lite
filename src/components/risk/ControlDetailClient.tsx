"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Pencil, Check, X } from "lucide-react";

interface Control {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface Props {
  control: Control;
  frameworkCode: string;
  canWrite: boolean;
}

const severityToVariant = (
  level: string,
): "danger" | "warn" | "success" | "critical" => {
  if (level === "critical") return "critical";
  if (level === "high") return "danger";
  if (level === "medium") return "warn";
  return "success";
};

export function ControlDetailClient({
  control,
  frameworkCode: _frameworkCode,
  canWrite,
}: Props) {
  const t = useTranslations("risk");
  const tc = useTranslations("common");
  const utils = trpc.useUtils();
  const update = trpc.risk.controlUpdate.useMutation({
    onSuccess: () => {
      utils.risk.frameworks.invalidate();
      setEditing(false);
    },
  });

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(control.title);
  const [description, setDescription] = useState(control.description);
  const [severity, setSeverity] = useState(control.severity);

  function handleCancel() {
    setTitle(control.title);
    setDescription(control.description);
    setSeverity(control.severity);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border-default bg-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-primary">
                {control.title}
              </h2>
              <Badge size="sm" variant={severityToVariant(control.severity)}>
                {t(`severity.${control.severity}`)}
              </Badge>
            </div>
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} className="mr-1" />
                {t("editControl")}
              </Button>
            )}
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-tertiary mb-2">
              {t("fields.description")}
            </h3>
            <p className="text-sm text-secondary whitespace-pre-wrap">
              {control.description || (
                <span className="italic">{t("noDescription")}</span>
              )}
            </p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-tertiary mb-2">
              {t("fields.code")}
            </h3>
            <p className="font-mono text-sm text-primary">{control.code}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-default bg-surface p-6 space-y-4">
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1.5">{t("fields.title")}</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-sm mb-1.5">
            {t("fields.description")}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={5000}
          />
        </div>
        <div>
          <label className="block text-sm mb-1.5">{t("fields.severity")}</label>
          <Select
            value={severity}
            onValueChange={(v) => setSeverity(v as typeof severity)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("severity.low")}</SelectItem>
              <SelectItem value="medium">{t("severity.medium")}</SelectItem>
              <SelectItem value="high">{t("severity.high")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {update.isError && (
          <p className="text-sm text-danger">{update.error.message}</p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              update.mutate({ id: control.id, title, description, severity })
            }
            disabled={update.isPending}
          >
            <Check size={14} className="mr-1" />
            {tc("save")}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleCancel}>
            <X size={14} className="mr-1" />
            {tc("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
