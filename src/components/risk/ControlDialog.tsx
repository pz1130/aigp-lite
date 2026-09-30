"use client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface ControlData {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameworkId: string;
  control?: ControlData;
}

export function ControlDialog({
  open,
  onOpenChange,
  frameworkId,
  control,
}: Props) {
  const t = useTranslations("risk");
  const tc = useTranslations("common");
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.risk.controlCreate.useMutation();
  const update = trpc.risk.controlUpdate.useMutation();

  useEffect(() => {
    if (open) {
      setCode(control?.code ?? "");
      setTitle(control?.title ?? "");
      setDescription(control?.description ?? "");
      setSeverity(control?.severity ?? "medium");
      setError(null);
    }
  }, [open, control]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (control) {
        await update.mutateAsync({
          id: control.id,
          title,
          description,
          severity,
        });
      } else {
        await create.mutateAsync({
          frameworkId,
          code,
          title,
          description,
          severity,
        });
      }
      await utils.risk.frameworks.invalidate();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>
          {control ? t("editControl") : t("addControl")}
        </DialogTitle>
        <DialogDescription>
          {control ? t("editControl") : t("addControl")}
        </DialogDescription>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1.5">
              {t("fields.code")}
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={!!control}
                required
                maxLength={50}
              />
            </label>
          </div>
          <div>
            <label className="block text-sm mb-1.5">
              {t("fields.title")}
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
              />
            </label>
          </div>
          <div>
            <label className="block text-sm mb-1.5">
              {t("fields.description")}
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={5000}
              />
            </label>
          </div>
          <div>
            <label className="block text-sm mb-1.5">
              {t("fields.severity")}
              <Select
                value={severity}
                onValueChange={(v) =>
                  setSeverity(v as "low" | "medium" | "high")
                }
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
            </label>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "..." : tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
