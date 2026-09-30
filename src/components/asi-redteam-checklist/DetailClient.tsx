"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

type Status = "unanswered" | "yes" | "no" | "na";

export function AsiChkDetailClient({ id }: { id: string }) {
  const t = useTranslations("asiRedteamChecklist");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.asiRedteamChecklist.get.useQuery({ id });
  const save = trpc.asiRedteamChecklist.saveAnswer.useMutation({
    onSuccess: () => utils.asiRedteamChecklist.get.invalidate({ id }),
  });
  const submit = trpc.asiRedteamChecklist.submit.useMutation({
    onSuccess: () => utils.asiRedteamChecklist.get.invalidate({ id }),
  });
  const approve = trpc.asiRedteamChecklist.approve.useMutation({
    onSuccess: () => utils.asiRedteamChecklist.get.invalidate({ id }),
  });
  const newVersion = trpc.asiRedteamChecklist.newVersion.useMutation({
    onSuccess: () => utils.asiRedteamChecklist.get.invalidate({ id }),
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
        <a className="underline" href={`/api/asi-redteam-checklist/${id}/pdf`}>
          {t("downloadPdf")}
        </a>
        <a className="underline" href={`/api/asi-redteam-checklist/${id}/xlsx`}>
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
            {(s.crossLinks.atlas.length > 0 ||
              s.crossLinks.llmTop10.length > 0 ||
              s.crossLinks.agenticThreats.length > 0 ||
              s.crossLinks.aivss.length > 0) && (
              <p className="px-3 pt-2 text-[11px] text-muted-foreground">
                {s.crossLinks.atlas.length > 0 && (
                  <span className="mr-3">
                    {t("atlas")}: {s.crossLinks.atlas.join(", ")}
                  </span>
                )}
                {s.crossLinks.llmTop10.length > 0 && (
                  <span className="mr-3">
                    {t("llmTop10")}: {s.crossLinks.llmTop10.join(", ")}
                  </span>
                )}
                {s.crossLinks.agenticThreats.length > 0 && (
                  <span className="mr-3">
                    {t("agenticThreats")}:{" "}
                    {s.crossLinks.agenticThreats.join(", ")}
                  </span>
                )}
                {s.crossLinks.aivss.length > 0 && (
                  <span>
                    {t("aivss")}: {s.crossLinks.aivss.join(", ")}
                  </span>
                )}
              </p>
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
