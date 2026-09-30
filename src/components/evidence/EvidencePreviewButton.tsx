"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Eye, Loader2 } from "lucide-react";

const PREVIEWABLE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
]);

export function isPreviewable(mimeType: string): boolean {
  return PREVIEWABLE.has(mimeType);
}

export function EvidencePreviewButton({
  id,
  filename,
  mimeType,
}: EvidencePreviewButtonProps) {
  const t = useTranslations("evidence");
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const src = `/api/evidence/download?id=${id}`;

  useEffect(() => {
    if (!open || isImage || isPdf) return;
    setLoading(true);
    setError(null);
    fetch(src, { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => setContent(text))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, src, isImage, isPdf]);

  if (!isPreviewable(mimeType)) return null;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Eye size={12} />
        {t("preview")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogTitle className="sr-only">{filename}</DialogTitle>
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="truncate text-sm font-medium text-primary">
              {filename}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {isImage && (
              <div className="flex items-center justify-center p-4">
                <img
                  src={src}
                  alt={filename}
                  className="max-h-[75vh] object-contain"
                />
              </div>
            )}
            {isPdf && (
              <iframe
                src={src}
                className="h-[75vh] w-full border-0"
                title={filename}
              />
            )}
            {!isImage && !isPdf && (
              <div className="p-4">
                {loading && (
                  <div className="flex items-center justify-center py-12 text-tertiary">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {t("loading")}
                  </div>
                )}
                {error && (
                  <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
                    {t("previewFailed")}: {error}
                  </div>
                )}
                {content !== null && (
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm text-primary font-mono">
                    {content}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t px-4 py-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface EvidencePreviewButtonProps {
  id: string;
  filename: string;
  mimeType: string;
}
