"use client";
import { useState, useRef } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import {
  Upload,
  Trash2,
  ArrowLeft,
  FileSpreadsheet,
  FileText,
} from "lucide-react";

interface RawControl {
  code: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameworkId: string;
}

type Step = "upload" | "preview";

export function ImportDialog({ open, onOpenChange, frameworkId }: Props) {
  const t = useTranslations("risk");
  const tc = useTranslations("common");
  const router = useRouter();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState<RawControl[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const batchCreate = trpc.risk.controlBatchCreate.useMutation();

  function reset() {
    setStep("upload");
    setLoading(false);
    setError(null);
    setControls([]);
    setSelectedFile(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError(t("noFileSelected"));
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("frameworkId", frameworkId);

      const res = await fetch("/api/risk/import", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("importError"));
        return;
      }

      if (!data.controls || data.controls.length === 0) {
        setError(t("importError"));
        return;
      }

      setControls(data.controls);
      setStep("preview");
    } catch {
      setError(t("importError"));
    } finally {
      setLoading(false);
    }
  }

  function removeRow(idx: number) {
    setControls((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateCell(idx: number, field: keyof RawControl, value: string) {
    setControls((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)),
    );
  }

  async function handleImport() {
    setLoading(true);
    setError(null);
    try {
      await batchCreate.mutateAsync({ frameworkId, controls });
      await utils.risk.frameworks.invalidate();
      router.refresh();
      onOpenChange(false);
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("importError"));
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate(format: "xlsx" | "md") {
    window.open(`/api/risk/import/template?format=${format}`, "_blank");
  }

  const _severityToVariant = (level: string): "danger" | "warn" | "success" => {
    if (level === "high") return "danger";
    if (level === "medium") return "warn";
    return "success";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogTitle>{t("importControls")}</DialogTitle>
        <DialogDescription>
          {step === "upload"
            ? t("uploadFile")
            : `${controls.length} ${t("previewControls").toLowerCase()}`}
        </DialogDescription>

        {step === "upload" && (
          <div className="space-y-6">
            {/* Template download */}
            <div>
              <h4 className="mb-2 text-sm font-medium text-secondary">
                {t("downloadTemplate")}
              </h4>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadTemplate("xlsx")}
                >
                  <FileSpreadsheet size={14} className="mr-1" />
                  {t("templateXlsx")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadTemplate("md")}
                >
                  <FileText size={14} className="mr-1" />
                  {t("templateMd")}
                </Button>
              </div>
            </div>

            {/* File upload */}
            <div>
              <h4 className="mb-2 text-sm font-medium text-secondary">
                {t("uploadFile")}
              </h4>
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-default p-8 transition-colors hover:border-accent cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={24} className="mb-2 text-tertiary" />
                <p className="text-sm text-secondary">{t("dropZone")}</p>
                <p className="mt-1 text-xs text-tertiary">
                  .xlsx, .md, .txt, .pdf
                </p>
                {selectedFile && (
                  <p className="mt-2 text-sm font-medium text-primary">
                    {selectedFile.name}
                  </p>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.md,.txt,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button
                onClick={handleUpload}
                disabled={loading || !selectedFile}
              >
                {loading ? t("parsing") : t("importFile")}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-28">{t("fields.code")}</Th>
                    <Th>{t("fields.title")}</Th>
                    <Th className="w-24">{t("fields.severity")}</Th>
                    <Th className="w-12" />
                  </Tr>
                </THead>
                <TBody>
                  {controls.map((c, i) => (
                    <Tr key={i}>
                      <Td>
                        <Input
                          value={c.code}
                          onChange={(e) =>
                            updateCell(i, "code", e.target.value)
                          }
                          className="h-7 text-xs"
                        />
                      </Td>
                      <Td>
                        <Input
                          value={c.title}
                          onChange={(e) =>
                            updateCell(i, "title", e.target.value)
                          }
                          className="h-7 text-xs"
                        />
                      </Td>
                      <Td>
                        <Select
                          value={c.severity}
                          onValueChange={(v) => updateCell(i, "severity", v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">
                              {t("severity.low")}
                            </SelectItem>
                            <SelectItem value="medium">
                              {t("severity.medium")}
                            </SelectItem>
                            <SelectItem value="high">
                              {t("severity.high")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeRow(i)}
                        >
                          <Trash2 size={14} className="text-danger" />
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-between">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("upload");
                  setError(null);
                }}
              >
                <ArrowLeft size={14} className="mr-1" />
                {t("back", { defaultMessage: "Back" })}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {tc("cancel")}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={loading || controls.length === 0}
                >
                  {loading
                    ? t("importing")
                    : `${t("importControls")} (${controls.length})`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
