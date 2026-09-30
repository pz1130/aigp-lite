"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function AnalyzeAllButton() {
  const t = useTranslations("inventory.classification");
  const { data, refetch } = trpc.inventory.unanalyzedCount.useQuery();
  const utils = trpc.useUtils();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const analyzeAll = trpc.inventory.analyzeUnanalyzed.useMutation({
    onError(err) {
      setErrorMsg(err.message || t("bulkError"));
    },
  });
  const [justQueued, setJustQueued] = useState<number | null>(null);

  const count = data?.count ?? 0;
  if (count === 0 && justQueued === null) return null;

  async function onClick() {
    setErrorMsg(null);
    const res = await analyzeAll.mutateAsync();
    setJustQueued(res.queued);
    await refetch();
    await utils.inventory.list.invalidate();
  }

  return (
    <div className="flex items-center gap-2">
      {justQueued != null && (
        <span className="text-xs text-secondary">
          {t("bulkQueued", { count: justQueued })}
        </span>
      )}
      {errorMsg && (
        <span className="rounded border border-danger/30 bg-danger/5 px-2 py-0.5 text-xs text-danger">
          {errorMsg}
        </span>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onClick}
        disabled={analyzeAll.isPending || count === 0}
      >
        <Sparkles size={14} />
        {analyzeAll.isPending ? t("queued") : t("analyzeAll", { count })}
      </Button>
    </div>
  );
}
