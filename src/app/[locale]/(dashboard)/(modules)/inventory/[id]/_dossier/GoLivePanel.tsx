"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import type { ReadinessEvaluation, GoLiveCurrent } from "@/lib/dossier/types";

export function GoLivePanel({
  usecaseId,
  readiness,
  current,
  oversightAttested,
  canApprove,
  canAttest,
}: {
  usecaseId: string;
  readiness: ReadinessEvaluation;
  current: GoLiveCurrent | null;
  oversightAttested: boolean;
  canApprove: boolean;
  canAttest: boolean;
}) {
  const t = useTranslations("dossier");
  const router = useRouter();
  const [rationale, setRationale] = useState("");
  const [conditions, setConditions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decide = trpc.dossier.recordDecision.useMutation({
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (e) =>
      setError(
        e.message === "blocking_checks_failing"
          ? t("goLive.blockingError")
          : e.message,
      ),
  });
  const attest = trpc.dossier.setOversightAttestation.useMutation({
    onSuccess: () => router.refresh(),
  });

  const submit = (status: "approved" | "live" | "rejected" | "withdrawn") =>
    decide.mutate({
      usecaseId,
      status,
      rationale,
      conditions: conditions
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });

  const approveDisabled =
    !canApprove || readiness.blockingFailing > 0 || decide.isPending;

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold">{t("goLive.title")}</h3>
      <div className="text-sm">
        <span className="text-gray-500">{t("goLive.currentStatus")}: </span>
        {current ? (
          <span className="font-medium">
            {readiness.state === "needs_re_review"
              ? t("state.needs_re_review")
              : t(
                  `state.${current.status === "approved" ? "ready" : current.status === "live" ? "live" : "not_ready"}`,
                )}
            {current.decidedByName
              ? ` — ${t("goLive.decidedBy", { name: current.decidedByName })}`
              : ""}
          </span>
        ) : (
          <span className="text-gray-400">{t("goLive.none")}</span>
        )}
      </div>
      {current &&
        current.boundModelRef !== null &&
        current.boundTier !== null && (
          <p className="text-xs text-gray-500">
            {t("goLive.boundFingerprint", {
              tier: current.boundTier,
              model: current.boundModelRef,
            })}
          </p>
        )}
      {readiness.state === "needs_re_review" && (
        <p className="text-sm text-orange-800">{t("goLive.staleWarning")}</p>
      )}
      {canApprove && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border border-gray-300 p-2 text-sm"
            placeholder={t("goLive.rationale")}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <textarea
            className="w-full rounded border border-gray-300 p-2 text-sm"
            placeholder={t("goLive.conditions")}
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={approveDisabled}
              onClick={() => submit("approved")}
              className="rounded bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {t("goLive.approve")}
            </button>
            <button
              disabled={approveDisabled}
              onClick={() => submit("live")}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {t("goLive.markLive")}
            </button>
            <button
              disabled={!canApprove || decide.isPending}
              onClick={() => submit("rejected")}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
              {t("goLive.reject")}
            </button>
            <button
              disabled={!canApprove || decide.isPending}
              onClick={() => submit("withdrawn")}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
              {t("goLive.withdraw")}
            </button>
          </div>
        </div>
      )}
      <div id="oversight" className="border-t border-gray-100 pt-3">
        <h4 className="text-sm font-medium">{t("oversight.title")}</h4>
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={oversightAttested}
            disabled={!canAttest || attest.isPending}
            onChange={(e) =>
              attest.mutate({ usecaseId, value: e.target.checked })
            }
          />
          {t("oversight.attest")}
        </label>
      </div>
    </div>
  );
}
