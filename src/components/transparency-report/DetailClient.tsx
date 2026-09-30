"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import type { TxrSnapshot } from "@/lib/transparency-report/aggregate";
import type { TxrOrgSnapshot } from "@/lib/transparency-report/org-aggregate";

const tierLabel = (t: ReturnType<typeof useTranslations>, n: number) =>
  n === 0 ? t("tierNone") : t(`tier${n}`);

export function TxrDetailClient({ id }: { id: string }) {
  const t = useTranslations("transparencyReport");
  const utils = trpc.useUtils();
  const q = trpc.transparencyReport.get.useQuery({ id });
  const save = trpc.transparencyReport.saveSection.useMutation();
  const submit = trpc.transparencyReport.submit.useMutation({
    onSuccess: () => utils.transparencyReport.get.invalidate({ id }),
  });
  const unsubmit = trpc.transparencyReport.unsubmit.useMutation({
    onSuccess: () => utils.transparencyReport.get.invalidate({ id }),
  });
  const approve = trpc.transparencyReport.approve.useMutation({
    onSuccess: () => utils.transparencyReport.get.invalidate({ id }),
  });
  const publish = trpc.transparencyReport.publish.useMutation({
    onSuccess: () => utils.transparencyReport.get.invalidate({ id }),
  });
  const newVersion = trpc.transparencyReport.newVersion.useMutation({
    onSuccess: () => utils.transparencyReport.get.invalidate({ id }),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data)
      setDrafts(
        Object.fromEntries(q.data.sections.map((s) => [s.key, s.text])),
      );
  }, [q.data]);

  if (!q.data) return <p className="p-4 text-sm">…</p>;
  const { report, sections, aggregation } = q.data;
  const isDraft = report.status === "draft";
  const isPortfolio = "portfolio" in aggregation;
  const orgSnap = aggregation as TxrOrgSnapshot;
  const sysSnap = aggregation as TxrSnapshot;

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-xl font-semibold">{report.title}</h1>
        <p className="text-sm text-muted-foreground">
          {report.periodLabel} ·{" "}
          {report.usecase ? report.usecase.name : t("scopeOrg")} · v
          {report.version} · {t(`status_${report.status}`)}
        </p>
        {!isPortfolio && (
          <p className="text-sm">
            {t("overallTier")}: {tierLabel(t, sysSnap.frt.overallTier)}
            {sysSnap.frt.found ? "" : ` (${t("noFrt")})`}
          </p>
        )}
      </div>

      {isPortfolio ? (
        <>
          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">{t("portfolio.systems")}</h2>
            <ul className="text-sm">
              {orgSnap.portfolio.map((p) => (
                <li key={p.usecaseId}>
                  {p.name} — {t("portfolio.tier")}{" "}
                  {p.frtTier === 0 ? t("tierNone") : p.frtTier} ·{" "}
                  {p.readinessState} · {t("portfolio.incidents")}{" "}
                  {p.incidents.total}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">{t("portfolio.totals")}</h2>
            <p className="text-sm">
              {t("portfolio.systemCount")}: {orgSnap.totals.systemCount} ·{" "}
              {t("portfolio.worstTier")}: {orgSnap.totals.worstTier} ·{" "}
              {t("portfolio.highRiskBlocked")}: {orgSnap.totals.highRiskBlocked}
            </p>
            <p className="text-sm">
              {t("postureScore")}: {orgSnap.posture.score} · {t("driftAvg")}:{" "}
              {orgSnap.drift.latestRun?.avgScore ?? "n/a"}
            </p>
          </section>
        </>
      ) : (
        <>
          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">{t("autoTiers")}</h2>
            <ul className="text-sm">
              {sysSnap.frt.byCategory.map((c) => (
                <li key={c.code}>
                  {c.title}: {tierLabel(t, c.assignedTier)} ({c.completionPct}
                  %)
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">{t("autoChanges")}</h2>
            <ul className="text-sm">
              {sysSnap.tierDeltas.byCategory.map((d) => (
                <li key={d.code}>
                  {d.code}: {tierLabel(t, d.from)} → {tierLabel(t, d.to)} (
                  {t(`delta_${d.direction}`)})
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">{t("autoIncidents")}</h2>
            <p className="text-sm">
              {t("incidentTotal")}: {sysSnap.incidents.total} · critical{" "}
              {sysSnap.incidents.bySeverity.critical} · high{" "}
              {sysSnap.incidents.bySeverity.high}
            </p>
          </section>

          <section className="rounded border p-3">
            <h2 className="mb-2 font-medium">{t("autoQuality")}</h2>
            <p className="text-sm">
              {t("postureScore")}: {sysSnap.posture.score} · {t("driftAvg")}:{" "}
              {sysSnap.drift.latestRun?.avgScore ?? "n/a"}
            </p>
          </section>
        </>
      )}

      <section className="space-y-4">
        {sections.map((s) => (
          <div key={s.key} className="space-y-1">
            <label className="text-sm font-medium">
              {t(`section_${s.key}`)}
              {s.required ? " *" : ""}
            </label>
            <p className="text-xs text-muted-foreground">
              {t(`sectionGuide_${s.key}`)}
            </p>
            <textarea
              className="min-h-24 w-full rounded border p-2 text-sm disabled:opacity-60"
              disabled={!isDraft}
              value={drafts[s.key] ?? ""}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
              }
              onBlur={() =>
                isDraft &&
                save.mutate({ id, key: s.key, text: drafts[s.key] ?? "" })
              }
            />
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {report.status === "draft" && (
          <Button onClick={() => submit.mutate({ id })}>{t("submit")}</Button>
        )}
        {report.status === "submitted" && (
          <Button variant="secondary" onClick={() => unsubmit.mutate({ id })}>
            {t("unsubmit")}
          </Button>
        )}
        {report.status === "submitted" && (
          <Button onClick={() => approve.mutate({ id })}>{t("approve")}</Button>
        )}
        {report.status === "approved" && (
          <Button onClick={() => publish.mutate({ id })}>{t("publish")}</Button>
        )}
        {report.status === "published" && (
          <Button onClick={() => newVersion.mutate({ id })}>
            {t("newVersion")}
          </Button>
        )}
        <a
          className="underline self-center text-sm"
          href={`/api/transparency-report/${id}/pdf`}
        >
          {t("downloadPdf")}
        </a>
        <a
          className="underline self-center text-sm"
          href={`/api/transparency-report/${id}/xlsx`}
        >
          {t("downloadExcel")}
        </a>
      </div>
      {(submit.error || approve.error || publish.error) && (
        <p className="text-sm text-red-600">
          {submit.error?.message ||
            approve.error?.message ||
            publish.error?.message}
        </p>
      )}
    </div>
  );
}
