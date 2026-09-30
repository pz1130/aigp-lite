"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SystemCardExport({ usecaseId }: { usecaseId: string }) {
  const t = useTranslations("dossier");
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<"md" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportMarkdown() {
    setPending("md");
    setError(null);
    try {
      const r = await utils.dossier.systemCardMarkdown.fetch({ usecaseId });
      triggerDownload(
        new Blob([r.markdown], { type: "text/markdown" }),
        r.filename,
      );
    } catch {
      setError(t("systemCard.failed"));
    } finally {
      setPending(null);
    }
  }

  async function exportPdf() {
    setPending("pdf");
    setError(null);
    try {
      const r = await utils.dossier.systemCardPdf.fetch({ usecaseId });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      triggerDownload(
        new Blob([bytes], { type: "application/pdf" }),
        r.filename,
      );
    } catch {
      setError(t("systemCard.failed"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-secondary">{t("systemCard.export")}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending !== null}
        onClick={exportMarkdown}
      >
        {t("systemCard.markdown")}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending !== null}
        onClick={exportPdf}
      >
        {t("systemCard.pdf")}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
