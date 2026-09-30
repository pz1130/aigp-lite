"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import type { UsageStats, UsageDeltas } from "@/lib/usage-insights/stats";
import type { UsageDiagnostic } from "@/lib/usage-insights/schema";

export function UiDetailClient({
  id,
  canWrite,
}: {
  id: string;
  canWrite: boolean;
}) {
  const t = useTranslations("usageInsights");
  const utils = trpc.useUtils();
  const q = trpc.usageInsights.get.useQuery({ id });
  const publish = trpc.usageInsights.publish.useMutation({
    onSuccess: () => utils.usageInsights.get.invalidate({ id }),
  });

  if (!q.data) return <p className="p-4 text-sm">…</p>;
  const { report, clusters } = q.data;

  const stats = report.statsJson as unknown as UsageStats;
  const deltas = report.deltaJson as unknown as UsageDeltas | null;
  const diagnostics = report.diagnostics as unknown as UsageDiagnostic[];

  const narrated = clusters.filter((c) => !c.isLongTail);
  const longTailCount = clusters
    .filter((c) => c.isLongTail)
    .reduce((n, c) => n + c.invocationCount, 0);

  return (
    <div className="space-y-6 p-1">
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
          {t("totalInvocations")}: {report.totalInvocations} ·{" "}
          {t("distinctActors")}: {stats.distinctActors} · {t("generated")}:{" "}
          {report.createdAt.toISOString().slice(0, 10)}
        </p>
        {report.suppressedClusterCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("kAnonNote")} ({t("suppressedClusters")}:{" "}
            {report.suppressedClusterCount})
          </p>
        )}
      </div>

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
          href={`/api/usage-insights/${id}/pdf`}
        >
          {t("exportPdf")}
        </a>
        <a
          className="underline self-center text-sm"
          href={`/api/usage-insights/${id}/xlsx`}
        >
          {t("exportXlsx")}
        </a>
      </div>
      {publish.error && (
        <p className="text-sm text-red-600">{publish.error.message}</p>
      )}

      <section className="rounded border p-3">
        <h2 className="mb-2 font-medium">{t("execSummary")}</h2>
        <p className="text-sm whitespace-pre-wrap">
          {report.execSummary || "—"}
        </p>
      </section>

      <section className="rounded border p-3">
        <h2 className="mb-2 font-medium">{t("delta")}</h2>
        {deltas ? (
          <>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {t("byTool")}
            </h3>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-1 font-normal">{t("tool")}</th>
                  <th className="font-normal">{t("prev")}</th>
                  <th className="font-normal">{t("curr")}</th>
                  <th className="font-normal">{t("change")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deltas.byTool).map(([k, v]) => (
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
              {t("byOutcome")}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-1 font-normal">{t("outcome")}</th>
                  <th className="font-normal">{t("prev")}</th>
                  <th className="font-normal">{t("curr")}</th>
                  <th className="font-normal">{t("change")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deltas.byOutcome).map(([k, v]) => (
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

      <section className="rounded border p-3">
        <h2 className="mb-2 font-medium">{t("stats")}</h2>
        <p className="text-sm">
          {t("total")}: {stats.total} · {t("clustered")}: {stats.clusteredCount}{" "}
          · {t("longTail")}: {stats.longTailCount}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("themes")}</h2>
        {narrated.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {report.totalInvocations === 0
              ? t("noConsentedData")
              : t("noThemes")}
          </p>
        )}
        {narrated.map((c) => {
          const topTools = c.topToolNames as unknown as {
            toolName: string;
            count: number;
          }[];
          const outcomes = c.outcomeBreakdown as unknown as Record<
            string,
            number
          >;
          return (
            <div key={c.id} className="rounded border p-3 space-y-1">
              <h3 className="font-medium">
                {c.themeLabel || t("unnamedTheme")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("invocationCount", { count: c.invocationCount })} ·{" "}
                {t("distinctActors")}: {c.distinctActorCount} ·{" "}
                {t("confidence")}: {c.confidence || "—"}
              </p>
              {topTools.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("topTools")}:{" "}
                  {topTools.map((x) => `${x.toolName} (${x.count})`).join(", ")}
                </p>
              )}
              {Object.keys(outcomes).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("outcomes")}:{" "}
                  {Object.entries(outcomes)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ")}
                </p>
              )}
              <p className="text-sm">{c.narrative || "—"}</p>
              {c.systemicObservation && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">
                    {t("systemicObservation")}:
                  </span>{" "}
                  {c.systemicObservation}
                </p>
              )}
            </div>
          );
        })}
        {longTailCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("longTail")}: {t("invocationCount", { count: longTailCount })}
          </p>
        )}
      </section>

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
