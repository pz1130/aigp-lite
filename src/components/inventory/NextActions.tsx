import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import type { Role } from "@/lib/rbac/roles";
import type { DossierSnapshot, ReadinessEvaluation } from "@/lib/dossier/types";
import { nextActions } from "@/lib/dossier/next-actions";

export async function NextActions({
  snapshot,
  readiness,
  role,
}: {
  snapshot: DossierSnapshot;
  readiness: ReadinessEvaluation;
  role: Role;
}) {
  const t = await getTranslations("actionGuide");
  const d = await getTranslations("dossier");
  const actions = nextActions(snapshot, readiness, role);
  const retired = snapshot.system.lifecycleStage === "deprecated";
  return (
    <section
      className="rounded-lg border border-accent/30 bg-surface p-4 space-y-3"
      aria-label={t("title")}
    >
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-secondary">
        {t(
          retired
            ? "retired"
            : readiness.state === "needs_re_review"
              ? "review"
              : readiness.blockingFailing > 0
                ? "blocked"
                : readiness.state === "live"
                  ? "live"
                  : "ready",
        )}
      </p>
      <ul className="divide-y divide-border-default">
        {actions.map((a) => (
          <li key={a.id} className="py-3 flex flex-wrap justify-between gap-2">
            <div>
              <p className="font-medium">
                {d(`checks.${a.id}.label`)}{" "}
                <span className="text-xs text-secondary">
                  {t(a.severity === "blocking" ? "required" : "optional")}
                </span>
              </p>
              <p className="text-sm text-secondary">{t(`hints.${a.id}`)}</p>
              <p className="text-xs text-secondary">
                {t("responsible", {
                  name:
                    a.responsible === "risk"
                      ? t("riskTeam")
                      : snapshot.system.ownerName || t("owner"),
                })}
              </p>
            </div>
            {a.canAct ? (
              <Link
                className="text-sm text-accent hover:underline"
                href={a.deepLink}
              >
                {t("handle")}
              </Link>
            ) : (
              <span className="text-sm text-secondary">{t("waiting")}</span>
            )}
          </li>
        ))}
      </ul>
      {!retired &&
        readiness.blockingFailing === 0 &&
        readiness.state !== "live" && (
          <Link className="text-sm text-accent hover:underline" href="#go-live">
            {t("decision")}
          </Link>
        )}
    </section>
  );
}
