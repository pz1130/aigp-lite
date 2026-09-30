import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { DossierSnapshot, ReadinessEvaluation } from "@/lib/dossier/types";

const STATE_STYLE: Record<string, string> = {
  not_ready: "bg-red-50 text-red-800 border-red-200",
  conditionally_ready: "bg-amber-50 text-amber-800 border-amber-200",
  ready: "bg-green-50 text-green-800 border-green-200",
  live: "bg-blue-50 text-blue-800 border-blue-200",
  needs_re_review: "bg-orange-50 text-orange-900 border-orange-200",
};

export async function ReadinessBanner({
  readiness,
  capability,
}: {
  readiness: ReadinessEvaluation;
  capability: DossierSnapshot["capability"];
}) {
  const t = await getTranslations("dossier");
  const tierLabel =
    !capability.assessed || capability.effectiveTier === null
      ? t("capability.notAssessed")
      : capability.effectiveTier === 0
        ? t("capability.tierZero")
        : t("capability.badge", { tier: capability.effectiveTier });
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-4 ${STATE_STYLE[readiness.state]}`}
    >
      <div>
        <div className="text-sm uppercase tracking-wide opacity-70">
          {t("readinessTitle")}
        </div>
        <div className="text-xl font-semibold">
          {t(`state.${readiness.state}`)}
        </div>
        <Badge variant="neutral" className="mt-2">
          {tierLabel}
        </Badge>
      </div>
      <div className="text-right text-sm">
        <div>{t("blockingFailing", { count: readiness.blockingFailing })}</div>
        <div className="opacity-70">
          {t("advisoryOpen", { count: readiness.advisoryOpen })}
        </div>
      </div>
    </div>
  );
}
