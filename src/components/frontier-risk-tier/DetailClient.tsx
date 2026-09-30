"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { deriveEffectiveTier } from "@/lib/frontier-risk-tier/effective-tier";

type Status = "unanswered" | "met" | "not_met" | "na";

const STATUS_KEY: Record<Exclude<Status, "unanswered">, string> = {
  met: "met",
  not_met: "notMet",
  na: "na",
};

export function FrtDetailClient({ id }: { id: string }) {
  const t = useTranslations("frontierRiskTier");
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.frontierRiskTier.get.useQuery({ id });
  const save = trpc.frontierRiskTier.saveAnswer.useMutation({
    onSuccess: () => utils.frontierRiskTier.get.invalidate({ id }),
  });
  const submit = trpc.frontierRiskTier.submit.useMutation({
    onSuccess: () => utils.frontierRiskTier.get.invalidate({ id }),
  });
  const approve = trpc.frontierRiskTier.approve.useMutation({
    onSuccess: () => utils.frontierRiskTier.get.invalidate({ id }),
  });
  const newVersion = trpc.frontierRiskTier.newVersion.useMutation({
    onSuccess: () => utils.frontierRiskTier.get.invalidate({ id }),
  });

  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">…</p>;
  const { assessment, catalog, scores } = data;
  const editable = assessment.status === "draft";
  const byCode = new Map(assessment.answers.map((a) => [a.thresholdCode, a]));

  const tierText = (n: number) => (n === 0 ? t("tierNone") : t(`tier${n}`));

  const tierByCode = new Map(
    catalog.flatMap((c) => c.thresholds.map((th) => [th.code, th.tier])),
  );
  const effective = deriveEffectiveTier(
    assessment.answers.map((a) => ({
      status: a.status,
      tier: tierByCode.get(a.thresholdCode) ?? 0,
    })),
  );
  const effectiveTierLabel =
    effective.tier === 0 || effective.tier === null
      ? t("effectiveTierZero")
      : t("effectiveTierSetting", { tier: effective.tier });

  const setStatus = (thresholdCode: string, status: Status) => {
    const cur = byCode.get(thresholdCode);
    save.mutate({
      assessmentId: id,
      thresholdCode,
      status,
      elaboration: cur?.elaboration ?? undefined,
      evidenceRefs: Array.isArray(cur?.evidenceRefs)
        ? (cur!.evidenceRefs as string[])
        : [],
    });
  };
  const setElaboration = (thresholdCode: string, elaboration: string) => {
    const cur = byCode.get(thresholdCode);
    save.mutate({
      assessmentId: id,
      thresholdCode,
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
        <span className="font-medium">
          {t("overallTier")}: {tierText(scores.overall.assignedTier)}
        </span>
        <span>
          {t("completion")}: {scores.overall.completionPct}%
        </span>
        <span className="font-medium text-amber-800">{effectiveTierLabel}</span>
        <a className="underline" href={`/api/frontier-risk-tier/${id}/pdf`}>
          {t("downloadPdf")}
        </a>
        <a className="underline" href={`/api/frontier-risk-tier/${id}/xlsx`}>
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

      {catalog.map((c) => (
        <div key={c.id} className="space-y-2">
          <details open className="border rounded">
            <summary className="cursor-pointer px-3 py-2 font-medium flex justify-between">
              <span>{c.title}</span>
              <span className="text-xs text-muted-foreground">
                {tierText(scores.byCategory[c.code].assignedTier)} ·{" "}
                {scores.byCategory[c.code].completionPct}%
              </span>
            </summary>
            <p className="px-3 pt-2 text-[11px] text-muted-foreground">
              {c.summary}
            </p>
            {[1, 2, 3].map((tier) => {
              const ths = c.thresholds.filter((th) => th.tier === tier);
              if (ths.length === 0) return null;
              return (
                <div key={tier} className="px-3 py-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t(`tier${tier}`)}
                  </p>
                  <div className="divide-y">
                    {ths.map((th) => {
                      const ans = byCode.get(th.code);
                      const status = (ans?.status as Status) ?? "unanswered";
                      return (
                        <div key={th.code} className="py-2 space-y-1">
                          <div className="flex gap-2 items-start">
                            <span className="w-32 font-mono text-[10px]">
                              {th.code}
                            </span>
                            <span className="flex-1 text-sm">
                              {th.statement}
                            </span>
                            <div className="flex gap-1">
                              {(["met", "not_met", "na"] as Status[]).map(
                                (st) => (
                                  <Button
                                    key={st}
                                    size="sm"
                                    variant={
                                      status === st ? "primary" : "secondary"
                                    }
                                    disabled={!editable}
                                    onClick={() => setStatus(th.code, st)}
                                  >
                                    {t(
                                      STATUS_KEY[
                                        st as Exclude<Status, "unanswered">
                                      ],
                                    )}
                                  </Button>
                                ),
                              )}
                            </div>
                          </div>
                          <textarea
                            className="w-full text-sm border rounded p-1"
                            rows={2}
                            placeholder={t("elaboration")}
                            disabled={!editable}
                            defaultValue={ans?.elaboration ?? ""}
                            onBlur={(e) =>
                              editable &&
                              setElaboration(th.code, e.target.value)
                            }
                          />
                          {th.guidance && (
                            <p className="text-xs text-muted-foreground">
                              {t("guidance")}: {th.guidance}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </details>
        </div>
      ))}
    </div>
  );
}
