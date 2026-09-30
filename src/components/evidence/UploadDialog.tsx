"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Upload } from "lucide-react";

export function UploadDialog() {
  const t = useTranslations("evidence");
  const router = useRouter();
  const usecases = trpc.inventory.list.useQuery();
  const frameworks = trpc.risk.frameworks.useQuery();

  const [open, setOpen] = useState(false);
  const [usecaseId, setUsecaseId] = useState("");
  const [controlId, setControlId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setUsecaseId("");
    setControlId("");
    setNotes("");
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("selectFile"));
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    if (usecaseId) fd.append("usecaseId", usecaseId);
    if (controlId) fd.append("controlId", controlId);
    if (notes) fd.append("notes", notes);

    setSubmitting(true);
    try {
      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        t("uploadFailed") + (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Upload size={14} />
        {t("upload")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (submitting && !v) return;
          if (!v) reset();
          setOpen(v);
        }}
      >
        <DialogContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogTitle>{t("upload")}</DialogTitle>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {t("file")} *
                <input
                  ref={fileRef}
                  type="file"
                  required
                  className="block w-full rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm text-primary file:mr-3 file:border-0 file:bg-transparent file:text-secondary"
                />
              </label>
              <p className="text-xs text-tertiary">{t("allowedTypes")}</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {t("usecase")}
                <Select value={usecaseId} onValueChange={setUsecaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("noUsecase")} />
                  </SelectTrigger>
                  <SelectContent>
                    {usecases.data?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {t("control")}
                <Select value={controlId} onValueChange={setControlId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("noControl")} />
                  </SelectTrigger>
                  <SelectContent>
                    {frameworks.data?.map((fw) =>
                      fw.controls.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {fw.code}/{c.code} — {c.title}
                        </SelectItem>
                      )),
                    )}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium">
                {t("notes")}
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  rows={3}
                />
              </label>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? t("uploading") : t("upload")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
