"use client";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

type Status = "unanswered" | "yes" | "no" | "na";

export function AgChkDetailClient({ id }: { id: string }) {
  const t = useTranslations("agenticGovernance");
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.agenticGovernance.get.useQuery({ id });
  const save = trpc.agenticGovernance.saveAnswer.useMutation({
    onSuccess: () => utils.agenticGovernance.get.invalidate({ id }),
  });
  const submit = trpc.agenticGovernance.submit.useMutation({
    onSuccess: () => utils.agenticGovernance.get.invalidate({ id }),
  });
  const approve = trpc.agenticGovernance.approve.useMutation({
    onSuccess: () => utils.agenticGovernance.get.invalidate({ id }),
  });
  const newVersion = trpc.agenticGovernance.newVersion.useMutation({
    onSuccess: () => utils.agenticGovernance.get.invalidate({ id }),
  });

  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">…</p>;
  const { assessment, catalog, scores } = data;
  const editable = assessment.status === "draft";
  const byCode = new Map(assessment.answers.map((a) => [a.itemCode, a]));

  const setStatus = (itemCode: string, status: Status) => {
    const cur = byCode.get(itemCode);
    save.mutate({
      assessmentId: id,
      itemCode,
      status,
      elaboration: cur?.elaboration ?? undefined,
      evidenceRefs: Array.isArray(cur?.evidenceRefs)
        ? (cur!.evidenceRefs as string[])
        : [],
    });
  };
  const setElaboration = (itemCode: string, elaboration: string) => {
    const cur = byCode.get(itemCode);
    save.mutate({
      assessmentId: id,
      itemCode,
      status: (cur?.status as Status) ?? "unanswered",
      elaboration,
      evidenceRefs: Array.isArray(cur?.evidenceRefs)
        ? (cur!.evidenceRefs as string[])
        : [],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm">
        <span>
          {assessment.usecase
            ? `${t("scopeUsecase")}: ${assessment.usecase.name}`
            : t("scopeOrg")}
        </span>
        <span>
          {t("status")}: {assessment.status}
        </span>
        <span>
          {t("completion")}: {scores.overall.completionPct}%
        </span>
        <span>
          {t("conformance")}: {scores.overall.conformancePct ?? "—"}%
        </span>
        <a className="underline" href={`/api/agentic-governance/${id}/pdf`}>
          {t("downloadPdf")}
        </a>
        <a className="underline" href={`/api/agentic-governance/${id}/xlsx`}>
          {t("downloadExcel")}
        </a>
        <div className="ml-auto flex gap-2">
          {assessment.status === "draft" && (
            <Button onClick={() => submit.mutate({ id })}>{t("submit")}</Button>
          )}
          {assessment.status === "submitted" && (
            <Button onClick={() => approve.mutate({ id })}>
              {t("approve")}
            </Button>
          )}
          {assessment.status === "approved" && (
            <Button onClick={() => newVersion.mutate({ id })}>
              {t("newVersion")}
            </Button>
          )}
        </div>
      </div>

      {catalog.map((s) => (
        <div key={s.id} className="space-y-2">
          <details open className="border rounded">
            <summary className="cursor-pointer px-3 py-2 font-medium flex justify-between">
              <span>
                {s.num}. {s.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {scores.bySection[s.key].completionPct}% ·{" "}
                {scores.bySection[s.key].conformancePct ?? "—"}%
              </span>
            </summary>
            {s.intent && (
              <p className="px-3 pt-2 text-[11px] text-muted-foreground">
                {s.intent}
              </p>
            )}
            {s.seeAlso.length > 0 && (
              <div className="px-3 pt-1 pb-2 flex flex-wrap gap-1">
                {s.seeAlso.map((ref) => (
                  <a
                    key={ref.slug}
                    href={`/${locale}/${ref.slug}`}
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 transition-colors"
                  >
                    {locale === "zh" ? ref.labelZh : ref.labelEn}
                  </a>
                ))}
              </div>
            )}
            <div className="divide-y">
              {s.items.map((it) => {
                const ans = byCode.get(it.code);
                const status = (ans?.status as Status) ?? "unanswered";
                return (
                  <div key={it.code} className="px-3 py-2 space-y-1">
                    <div className="flex gap-2 items-start">
                      <span className="w-16 font-mono text-xs">{it.code}</span>
                      <span className="flex-1 text-sm">{it.text}</span>
                      <div className="flex gap-1">
                        {(["yes", "no", "na"] as Status[]).map((st) => (
                          <Button
                            key={st}
                            size="sm"
                            variant={status === st ? "primary" : "secondary"}
                            disabled={!editable}
                            onClick={() => setStatus(it.code, st)}
                          >
                            {t(st)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      className="w-full text-sm border rounded p-1"
                      rows={2}
                      placeholder={t("elaboration")}
                      disabled={!editable}
                      defaultValue={ans?.elaboration ?? ""}
                      onBlur={(e) =>
                        editable && setElaboration(it.code, e.target.value)
                      }
                    />
                    {it.guidance && (
                      <p className="text-xs text-muted-foreground">
                        {t("guidance")}: {it.guidance}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
