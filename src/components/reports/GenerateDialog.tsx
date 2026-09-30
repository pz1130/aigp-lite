"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ReportTemplateId } from "@/lib/reports/types";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const defaultStart = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
};
const defaultEnd = () => new Date().toISOString().slice(0, 10);

const REPORT_TEMPLATE_IDS: ReportTemplateId[] = [
  "nist-ai-rmf",
  "iso-27001",
  "soc2-type2",
  "iso-42001",
  "eu-ai-act",
  "mindforge",
];

function isReportTemplateId(value: string): value is ReportTemplateId {
  return REPORT_TEMPLATE_IDS.includes(value as ReportTemplateId);
}

interface Props {
  onClose: () => void;
}

export function GenerateDialog({ onClose }: Props) {
  const t = useTranslations();
  const templatesQ = trpc.reports.templates.useQuery();
  const generate = trpc.reports.generate.useMutation();
  const [templateId, setTemplateId] = useState<ReportTemplateId>("nist-ai-rmf");
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(defaultEnd());
  const [formats, setFormats] = useState<("pdf" | "xlsx")[]>(["pdf", "xlsx"]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setProgress(t("reports.progress.aggregating"));
    try {
      await generate.mutateAsync({
        templateId,
        periodStart: new Date(start),
        periodEnd: new Date(end),
        formats,
      });
      onClose();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent className="w-[28rem] max-w-[calc(100vw-2rem)]">
        <form onSubmit={submit} className="space-y-4">
          <DialogTitle>{t("reports.generate")}</DialogTitle>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("reports.field.template")}
            </label>
            <Select
              value={templateId}
              onValueChange={(value) => {
                if (isReportTemplateId(value)) setTemplateId(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(templatesQ.data ?? []).map((tmpl) => (
                  <SelectItem key={tmpl.id} value={tmpl.id}>
                    {tmpl.id} ({tmpl.controlCount} controls)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="text-sm font-medium">
                {t("reports.field.periodStart")}
              </span>
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1"
                required
              />
            </label>
            <label className="flex-1">
              <span className="text-sm font-medium">
                {t("reports.field.periodEnd")}
              </span>
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1"
                required
              />
            </label>
          </div>
          <div>
            <span className="text-sm font-medium">Formats</span>
            <div className="flex gap-4 mt-1">
              {(["pdf", "xlsx"] as const).map((f) => (
                <label
                  key={f}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={formats.includes(f)}
                    onCheckedChange={(v) =>
                      setFormats((c) =>
                        v === true ? [...c, f] : c.filter((x) => x !== f),
                      )
                    }
                  />
                  {f.toUpperCase()}
                </label>
              ))}
            </div>
          </div>
          {progress && <p className="text-xs text-tertiary">{progress}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || formats.length === 0}>
              {submitting ? t("reports.generating") : t("reports.generate")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
