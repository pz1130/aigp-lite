"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import type { TrendStats, TrendDeltas } from "@/lib/incident-trends/stats";
import type { TrendDiagnostic } from "@/lib/incident-trends/schema";

export function ItDetailClient({
  id,
  canWrite,
}: {
  id: string;
  canWrite: boolean;
}) {
  const t = useTranslations("incidentTrends");
  const utils = trpc.useUtils();
  const q = trpc.incidentTrends.get.useQuery({ id });
  const publish = trpc.incidentTrends.publish.useMutation({
    onSuccess: () => utils.incidentTrends.get.invalidate({ id }),
  });

  if (!q.data) return <p className="p-4 text-sm">…</p>;
  const { report, clusters } = q.data;

  const stats = report.statsJson as unknown as TrendStats;
  const deltas = report.deltaJson as unknown as TrendDeltas | null;
  const diagnostics = report.diagnostics as unknown as TrendDiagnostic[];

  const narrated = clusters.filter((c) => !c.isLongTail);
  const longTailCount = clusters
    .filter((c) => c.isLongTail)
    .reduce((n, c) => n + c.memberCount, 0);

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">
          {t("title")} v{report.version}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("window")}: {report.windowStart.toISOString().slice(0, 10)} →{" "}
          {report.windowEnd.toISOString().slice(0, 10)} ·{" "}
          {statusLabel(report.status)}
          {report.publishedAt
            ? ` · ${report.publishedAt.toISOString().slice(0, 10)}`
            : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("incidentsCount", { count: report.incidentCount })} ·{" "}
          {t("generated")}: {report.createdAt.toISOString().slice(0, 10)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {canWrite && report.status === "draft" && (
          <Button
            onClick={() => publish.mutate({ id })}
            disabled={publish.isPending}
          >
            {t("publish")}
          </Button>
        )}
        <a
          className="underline self-center text-sm"
          href={`/api/incident-trends/${id}/pdf`}
        >
          {t("downloadPdf")}
        </a>
        <a
          className="underline self-center text-sm"
          href={`/api/incident-trends/${id}/xlsx`}
        >
          {t("downloadXlsx")}
        </a>
      </div>
      {publish.error && (
        <p className="text-sm text-red-600">{publish.error.message}</p>
      )}

      {/* Executive summary */}
      <section className="rounded border p-3">
        <h2 className="mb-2 font-medium">{t("execSummary")}</h2>
        <p className="text-sm whitespace-pre-wrap">
          {report.execSummary || "—"}
        </p>
      </section>

      {/* Delta strip */}
      <section className="rounded border p-3">
        <h2 className="mb-2 font-medium">{t("delta")}</h2>
        {deltas ? (
          <>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {t("category")}
            </h3>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-1 font-normal">{t("category")}</th>
                  <th className="font-normal">{t("prev")}</th>
                  <th className="font-normal">{t("curr")}</th>
                  <th className="font-normal">{t("change")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deltas.byCategory).map(([k, v]) => (
                  <tr key={k} className="border-b">
                    <td className="py-1">{k}</td>
                    <td>{v.prev}</td>
                    <td>{v.curr}</td>
                    <td>
                      {v.pct != null
                        ? `${v.pct > 0 ? "+" : ""}${v.pct}%`
                        : t("baseline")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {t("severity")}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-1 font-normal">{t("severity")}</th>
                  <th className="font-normal">{t("prev")}</th>
                  <th className="font-normal">{t("curr")}</th>
                  <th className="font-normal">{t("change")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deltas.bySeverity).map(([k, v]) => (
                  <tr key={k} className="border-b">
                    <td className="py-1">{k}</td>
                    <td>{v.prev}</td>
                    <td>{v.curr}</td>
                    <td>
                      {v.pct != null
                        ? `${v.pct > 0 ? "+" : ""}${v.pct}%`
                        : t("baseline")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noDeltaData")}</p>
        )}
      </section>

      {/* Stats */}
      <section className="rounded border p-3">
        <h2 className="mb-2 font-medium">{t("stats")}</h2>
        <p className="text-sm">
          {t("total")}: {stats.total} · {t("clustered")}: {stats.clusteredCount}{" "}
          · {t("longTail")}: {stats.longTailCount}
        </p>
        {stats.topUsecases.length > 0 && (
          <ul className="mt-2 text-sm space-y-0.5">
            {stats.topUsecases.map((u) => (
              <li key={u.usecaseId} className="text-muted-foreground">
                {u.name}: {u.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Clusters */}
      <section className="space-y-3">
        <h2 className="font-medium">{t("clusters")}</h2>
        {narrated.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("noClusters")}</p>
        )}
        {narrated.map((c) => (
          <div key={c.id} className="rounded border p-3 space-y-1">
            <h3 className="font-medium">{c.label || t("unnamedCluster")}</h3>
            <p className="text-xs text-muted-foreground">
              {c.dominantSeverity}
              {c.dominantCategory ? ` · ${c.dominantCategory}` : ""} ·{" "}
              {t("incidentsCount", { count: c.memberCount })} ·{" "}
              {t("confidence")}: {c.confidence || "—"}
            </p>
            <p className="text-sm">{c.narrative || "—"}</p>
            {c.systemicRecommendation && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">
                  {t("systemicRecommendation")}:
                </span>{" "}
                {c.systemicRecommendation}
              </p>
            )}
          </div>
        ))}
        {longTailCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("longTail")}: {t("incidentsCount", { count: longTailCount })}
          </p>
        )}
      </section>

      {/* Diagnostics */}
      {diagnostics.length > 0 && (
        <section className="rounded border p-3">
          <h2 className="mb-2 font-medium">{t("diagnostics")}</h2>
          <ul className="text-sm space-y-1">
            {diagnostics.map((d, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-mono text-xs">{d.code}</span>: {d.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  function statusLabel(s: string): string {
    if (s === "published") return t("published");
    if (s === "superseded") return t("superseded");
    return t("draft");
  }
}
