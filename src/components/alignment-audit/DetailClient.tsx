"use client";

import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { OutcomeBadge } from "./OutcomeBadge";

export function DetailClient({ auditId }: { auditId: string }) {
  const t = useTranslations("alignmentAudit");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.alignmentAudit.get.useQuery(
    { id: auditId },
    {
      refetchInterval: (q) =>
        q.state.data?.audit.status === "running" ||
        q.state.data?.audit.status === "pending"
          ? 2000
          : false,
    },
  );

  const escalate = trpc.alignmentAudit.escalate.useMutation({
    onSuccess: () => utils.alignmentAudit.get.invalidate({ id: auditId }),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  const { audit, results } = data;
  const erroredCount = results.filter((r) => r.errored).length;
  const byDimension = new Map<string, typeof results>();
  for (const r of results) {
    const list = byDimension.get(r.dimension) ?? [];
    list.push(r);
    byDimension.set(r.dimension, list);
  }

  const canEscalate =
    (audit.outcome === "fail" || audit.outcome === "concerns") &&
    !audit.escalatedIncidentId;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">{t("outcome")}</div>
          <OutcomeBadge status={audit.status} outcome={audit.outcome} />
        </div>
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">
            {t("maxConcernScore")}
          </div>
          <div className="text-sm font-medium">
            {audit.maxConcernScore != null
              ? audit.maxConcernScore.toFixed(1)
              : "—"}
          </div>
        </div>
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">
            {t("worstDimension")}
          </div>
          <div className="text-sm">
            {audit.worstDimension?.replace(/_/g, " ") ?? "—"}
          </div>
        </div>
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">{t("targetModel")}</div>
          <div className="text-sm">
            {audit.targetProvider}/{audit.targetModel}
          </div>
        </div>
      </div>

      {(audit.status === "running" || audit.status === "pending") && (
        <p className="text-sm text-muted-foreground">
          {t("progress", {
            completed: audit.completedCount,
            total: audit.totalCount,
          })}
        </p>
      )}

      {erroredCount > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {t("erroredBanner", { count: erroredCount })}
        </p>
      )}

      {canEscalate && (
        <Button
          type="button"
          onClick={() => escalate.mutate({ auditId })}
          disabled={escalate.isPending}
        >
          {t("escalate")}
        </Button>
      )}
      {audit.escalatedIncidentId && (
        <p className="text-sm">
          {t("escalated")}{" "}
          <Link
            href={`/incidents/${audit.escalatedIncidentId}`}
            className="underline"
          >
            {t("viewIncident")}
          </Link>
        </p>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-secondary">
          {t("dimensions")}
        </h3>
        {[...byDimension.entries()].map(([dim, rows]) => (
          <details
            key={dim}
            className="rounded-md border border-border-default"
            open
          >
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {dim.replace(/_/g, " ")}
            </summary>
            <div className="border-t border-border-default px-3 py-2 space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="text-sm space-y-1">
                  <div className="flex gap-4">
                    <span>
                      {t("concernScore")}: {r.concernScore.toFixed(1)}
                      {r.errored ? " (error)" : ""}
                    </span>
                  </div>
                  <p>
                    <span className="font-medium">{t("judgment")}: </span>
                    {r.judgment}
                  </p>
                  {r.actualOutput ? (
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t("actualOutput")}:{" "}
                      </span>
                      {r.actualOutput}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
