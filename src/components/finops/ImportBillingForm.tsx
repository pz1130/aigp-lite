"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, FileText, CheckCircle, AlertTriangle } from "lucide-react";

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  format: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportBillingForm({ open, onOpenChange, onImported }: Props) {
  const t = useTranslations("finops.import");
  const tCommon = useTranslations("common");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(f: File) {
    if (!f.name.endsWith(".csv")) {
      setError(t("invalidFileType"));
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/finops/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("importFailed"));
      } else {
        setResult(data);
        if (data.imported > 0) {
          onImported();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("importFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>

        {!result ? (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver ? "border-accent bg-accent/5" : "border-border-default"
              }`}
            >
              <Upload size={24} className="text-tertiary" />
              <p className="text-sm text-secondary">{t("dropzone")}</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                {t("selectFile")}
              </Button>
            </div>

            {/* Selected file */}
            {file && (
              <div className="flex items-center gap-2 rounded border bg-muted/50 p-3">
                <FileText size={16} className="text-accent" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-tertiary">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}

            {/* Format hint */}
            <div className="rounded border bg-muted/30 p-3">
              <p className="text-xs font-medium text-secondary mb-2">
                {t("supportedFormats")}
              </p>
              <ul className="text-xs text-tertiary space-y-1">
                <li>
                  • <strong>Azure OpenAI:</strong> Time, Model Name,
                  InputTokens, OutputTokens, Cost
                </li>
                <li>
                  • <strong>{t("bailianLabel")}:</strong> {t("bailianColumns")}
                </li>
              </ul>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded border border-danger/30 bg-danger/5 p-3">
                <AlertTriangle
                  size={16}
                  className="text-danger shrink-0 mt-0.5"
                />
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                disabled={!file || loading}
                onClick={handleImport}
              >
                {loading ? t("importing") : t("import")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Result summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded border bg-surface p-3 text-center">
                <p className="text-xs text-tertiary">{t("result.total")}</p>
                <p className="text-lg font-semibold">{result.total}</p>
              </div>
              <div className="rounded border bg-success/10 p-3 text-center">
                <p className="text-xs text-tertiary">{t("result.imported")}</p>
                <p className="text-lg font-semibold text-success">
                  {result.imported}
                </p>
              </div>
              <div className="rounded border bg-warning/10 p-3 text-center">
                <p className="text-xs text-tertiary">{t("result.skipped")}</p>
                <p className="text-lg font-semibold text-warn">
                  {result.skipped}
                </p>
              </div>
            </div>

            {/* Format detected */}
            {result.format && (
              <div className="flex items-center gap-2 text-sm text-secondary">
                <CheckCircle size={14} className="text-success" />
                {t("formatDetected")}:{" "}
                {result.format === "azure" ? "Azure OpenAI" : t("bailianLabel")}
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="rounded border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs font-medium text-warn mb-2">
                  <AlertTriangle size={12} className="inline mr-1" />
                  {t("result.warnings")} ({result.errors.length})
                </p>
                <ul className="text-xs text-secondary space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                  {result.errors.length > 10 && (
                    <li>
                      •{" "}
                      {t("result.moreErrors", {
                        count: result.errors.length - 10,
                      })}
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={reset}>
                {t("importMore")}
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                {tCommon("save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
