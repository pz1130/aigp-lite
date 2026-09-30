"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Download } from "lucide-react";

export function AssessmentForm({ usecaseId }: { usecaseId: string }) {
  const t = useTranslations("risk");
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pdfId, setPdfId] = useState<string | null>(null);
  const assess = trpc.risk.assess.useMutation({
    onSuccess: (data) => {
      setError(null);
      setSuccess(true);
      setPdfId(data.pdfFileKey ? data.id : null);
      router.refresh();
    },
    onError: (err) => {
      setSuccess(false);
      setError(err.message);
    },
  });

  return (
    <div className="rounded-lg border border-border-default bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-secondary">
        {t("assess")}
      </h3>
      <Textarea
        className="w-full"
        rows={4}
        placeholder={t("notesPlaceholder")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={2000}
      />
      <div className="mt-3 flex items-center gap-4">
        <Button
          size="sm"
          onClick={() => {
            setError(null);
            setSuccess(false);
            assess.mutate({ usecaseId, notes });
          }}
          disabled={assess.isPending}
        >
          {assess.isPending ? t("assessing") : t("runAssessment")}
        </Button>
      </div>
      {error && (
        <p className="mt-2 rounded bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {success && (
        <div className="mt-2 rounded bg-success-subtle px-3 py-2 text-sm text-success">
          <p>{t("assessmentSuccess")}</p>
          {pdfId && (
            <a
              href={`/api/risk/assessment/${pdfId}/pdf`}
              className="mt-1 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <Download size={14} />
              {t("downloadReport")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
