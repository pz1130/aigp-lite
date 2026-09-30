"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

type Status = "unanswered" | "yes" | "no" | "na";

export function AivtfDetailClient({ id }: { id: string }) {
  const t = useTranslations("aivtf");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.aivtf.get.useQuery({ id });
  const save = trpc.aivtf.saveAnswer.useMutation({
    onSuccess: () => utils.aivtf.get.invalidate({ id }),
  });
  const submit = trpc.aivtf.submit.useMutation({
    onSuccess: () => utils.aivtf.get.invalidate({ id }),
  });
  const approve = trpc.aivtf.approve.useMutation({
    onSuccess: () => utils.aivtf.get.invalidate({ id }),
  });
  const newVersion = trpc.aivtf.newVersion.useMutation({
    onSuccess: () => utils.aivtf.get.invalidate({ id }),
  });

  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">…</p>;
  const { assessment, catalog, scores } = data;
  const editable = assessment.status === "draft";
  const byCode = new Map(assessment.answers.map((a) => [a.processCode, a]));

  const setStatus = (processCode: string, status: Status) => {
    const cur = byCode.get(processCode);
    save.mutate({
      assessmentId: id,
      processCode,
      status,
      elaboration: cur?.elaboration ?? undefined,
      evidenceRefs: Array.isArray(cur?.evidenceRefs)
        ? (cur!.evidenceRefs as string[])
        : [],
    });
  };
  const setElaboration = (processCode: string, elaboration: string) => {
    const cur = byCode.get(processCode);
    save.mutate({
      assessmentId: id,
      processCode,
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
        <a className="underline" href={`/api/aivtf/${id}/pdf`}>
          {t("downloadPdf")}
        </a>
        <a className="underline" href={`/api/aivtf/${id}/xlsx`}>
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

      {catalog.map((p, pi) => (
        <details key={p.id} open className="border rounded">
          <summary className="cursor-pointer px-3 py-2 font-medium flex justify-between">
            <span>
              {p.num}. {p.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {scores.byPrinciple[pi].completionPct}% ·{" "}
              {scores.byPrinciple[pi].conformancePct ?? "—"}%
            </span>
          </summary>
          <div className="divide-y">
            {p.outcomes
              .flatMap((o) => o.processes)
              .map((pr) => {
                const ans = byCode.get(pr.code);
                const status = (ans?.status as Status) ?? "unanswered";
                return (
                  <div key={pr.code} className="px-3 py-2 space-y-1">
                    <div className="flex gap-2 items-start">
                      <span className="w-12 font-mono text-xs">{pr.code}</span>
                      <span className="flex-1 text-sm">
                        {pr.text}
                        {pr.typeOfAI === "GENAI_ONLY" && (
                          <em className="ml-2 text-xs text-amber-600">
                            {t("genAiOnly")}
                          </em>
                        )}
                        {pr.typeOfAI === "TRADITIONAL_ONLY" && (
                          <em className="ml-2 text-xs text-sky-600">
                            {t("traditionalOnly")}
                          </em>
                        )}
                      </span>
                      <div className="flex gap-1">
                        {(["yes", "no", "na"] as Status[]).map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant={status === s ? "primary" : "secondary"}
                            disabled={!editable}
                            onClick={() => setStatus(pr.code, s)}
                          >
                            {t(s)}
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
                        editable && setElaboration(pr.code, e.target.value)
                      }
                    />
                    {pr.evidenceType && (
                      <p className="text-xs text-muted-foreground">
                        {t("evidence")}: {pr.evidenceType}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </details>
      ))}
    </div>
  );
}
