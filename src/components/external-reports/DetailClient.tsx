"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";

export function DetailClient({ reportId }: { reportId: string }) {
  const t = useTranslations("externalReports");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.externalReports.get.useQuery({
    id: reportId,
  });
  const [notes, setNotes] = useState("");
  const [clause, setClause] = useState("");

  useEffect(() => {
    if (data?.report) {
      setNotes(data.report.triageNotes);
      setClause(data.report.citedProhibitedUseClause);
    }
  }, [data?.report]);

  const transition = trpc.externalReports.transition.useMutation({
    onSuccess: () => utils.externalReports.get.invalidate({ id: reportId }),
  });
  const escalate = trpc.externalReports.escalate.useMutation({
    onSuccess: () => utils.externalReports.get.invalidate({ id: reportId }),
  });

  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  const { report, similar } = data;
  const isTerminal = ["resolved", "rejected", "duplicate"].includes(
    report.status,
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-medium">{report.title}</h2>
        <p className="text-sm">
          {t(
            `public.type${report.type === "vulnerability" ? "Vulnerability" : "UsageViolation"}`,
          )}{" "}
          · {t(`status.${report.status}`)}
        </p>
        <p className="whitespace-pre-wrap text-sm">{report.description}</p>
        {report.reproSteps ? (
          <div>
            <h3 className="text-sm font-medium">{t("public.reproLabel")}</h3>
            <p className="whitespace-pre-wrap text-sm">{report.reproSteps}</p>
          </div>
        ) : null}
        {report.reporterEmail ? (
          <p className="text-sm text-muted-foreground">
            {t("reporter")}: {report.reporterEmail}
          </p>
        ) : null}
      </section>

      {report.type === "usage_violation" && (
        <label className="block text-sm font-medium">
          {t("citedClause")}
          <textarea
            value={clause}
            onChange={(e) => setClause(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border p-2"
          />
        </label>
      )}

      <label className="block text-sm font-medium">
        {t("triageNotes")}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border p-2"
        />
      </label>

      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {report.status === "received" && (
            <button
              type="button"
              onClick={() =>
                transition.mutate({
                  id: reportId,
                  status: "triaging",
                  triageNotes: notes,
                })
              }
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              {t("action.startTriage")}
            </button>
          )}
          {!report.escalatedIncidentId && (
            <button
              type="button"
              onClick={() => escalate.mutate({ id: reportId })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            >
              {t("action.escalate")}
            </button>
          )}
          {["received", "triaging", "accepted"].includes(report.status) && (
            <button
              type="button"
              onClick={() =>
                transition.mutate({
                  id: reportId,
                  status: "resolved",
                  triageNotes: notes,
                  citedProhibitedUseClause: clause || undefined,
                })
              }
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              {t("action.resolve")}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              transition.mutate({
                id: reportId,
                status: "rejected",
                triageNotes: notes,
              })
            }
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            {t("action.reject")}
          </button>
          <button
            type="button"
            onClick={() =>
              transition.mutate({
                id: reportId,
                status: "duplicate",
                triageNotes: notes,
              })
            }
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            {t("action.markDuplicate")}
          </button>
        </div>
      )}

      <section>
        <h3 className="text-sm font-medium">{t("similar.title")}</h3>
        {similar.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("similar.none")}</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {similar.map((s) => (
              <li key={`${s.kind}-${s.id}`}>
                [{t(`similar.${s.kind}`)}] {s.title} —{" "}
                {(s.similarity * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
