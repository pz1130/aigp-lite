"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export function MergeSuggestionBanner({ incidentId }: { incidentId: string }) {
  const t = useTranslations("incident.automation");
  const utils = trpc.useUtils();
  const sugQ = trpc.incident.getMergeSuggestion.useQuery({ incidentId });
  const merge = trpc.incident.mergeInto.useMutation({
    onSuccess: () => utils.incident.invalidate(),
  });
  const dismiss = trpc.incident.dismissSuggestion.useMutation({
    onSuccess: () => utils.incident.invalidate(),
  });

  const sug = sugQ.data;
  if (!sug) return null;

  const pct = Math.round(sug.similarity * 100);
  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <span className="mr-2">💡</span>
          {t("similar_to")}{" "}
          <Link
            href={`./${sug.candidateIncidentId}`}
            className="font-medium underline"
          >
            #{sug.candidateIncidentId.slice(0, 7)} — {sug.candidate.title}
          </Link>{" "}
          <span className="text-amber-800 dark:text-amber-200">({pct}%)</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700"
            disabled={merge.isPending}
            onClick={() =>
              merge.mutate({
                sourceId: incidentId,
                targetId: sug.candidateIncidentId,
              })
            }
          >
            {t("merge_into", { id: sug.candidateIncidentId.slice(0, 7) })}
          </button>
          <button
            type="button"
            className="rounded border border-amber-400 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:text-amber-200"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate({ id: sug.id })}
          >
            {t("dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
