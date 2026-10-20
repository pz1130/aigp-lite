import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import type { SessionContext } from "@/lib/auth/session";
import { buildDossierSnapshot } from "@/lib/dossier/aggregate";
import { evaluateReadiness } from "@/lib/dossier/readiness";
import { isMyApproval, nextActions } from "@/lib/dossier/next-actions";

export async function MyTasks({ session }: { session: SessionContext }) {
  const t = await getTranslations("actionGuide");
  const d = await getTranslations("dossier");
  const db = withOrg(prisma, session.orgId);
  const [instances, usecases] = await Promise.all([
    db.workflowInstance.findMany({
      where: { state: "open" },
      include: {
        steps: true,
        usecase: { select: { name: true, ownerId: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.aiUsecase.findMany({
      where: {
        lifecycleStage: { not: "deprecated" },
        ...(session.role === "admin" || session.role === "risk_officer"
          ? {}
          : { ownerId: session.userId }),
      },
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 10,
    }),
  ]);
  const approvals = instances.filter((i) =>
    isMyApproval(i, session.userId, session.role),
  );
  const changes = instances.filter(
    (i) =>
      i.usecase.ownerId === session.userId &&
      i.steps.some(
        (s) =>
          s.stepIndex === i.currentStep && s.decision === "requested_changes",
      ),
  );
  const materials = [];
  // Bound preview work and avoid loading all dossiers concurrently.
  for (const u of usecases) {
    const snapshot = await buildDossierSnapshot(db, session.orgId, u.id);
    if (!snapshot) continue;
    const actions = nextActions(
      snapshot,
      evaluateReadiness(snapshot),
      session.role,
    ).filter((a) => a.canAct);
    if (actions.length) materials.push({ snapshot, actions });
  }
  return (
    <section aria-label={t("todos")} className="space-y-4">
      <h2 className="text-xl font-semibold">{t("todos")}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border-default p-4 space-y-3">
          <h3 className="font-semibold">
            {t("approvals")} · {approvals.length}
          </h3>
          {!approvals.length && (
            <p className="text-sm text-secondary">{t("emptyApprovals")}</p>
          )}
          <ul className="space-y-3">
            {approvals.map((i) => (
              <li key={i.id}>
                <Link
                  className="text-accent hover:underline"
                  href={`/workflow/${i.id}`}
                >
                  {i.usecase.name} ·{" "}
                  {i.steps.find((s) => s.stepIndex === i.currentStep)?.stepName}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border-default p-4 space-y-3">
          <h3 className="font-semibold">
            {t("materials")} · {materials.length + changes.length}
          </h3>
          <p className="text-xs text-secondary">{t("scope")}</p>
          {!materials.length && !changes.length && (
            <p className="text-sm text-secondary">{t("emptyMaterials")}</p>
          )}
          <ul className="space-y-2">
            {changes.map((i) => (
              <li key={i.id}>
                <Link
                  className="text-accent hover:underline"
                  href={`/workflow/${i.id}`}
                >
                  {i.usecase.name} · {t("changes")}
                </Link>
                <p className="text-sm text-secondary">
                  {i.steps.find((s) => s.stepIndex === i.currentStep)?.comment}
                </p>
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-border-default">
            {materials.map(({ snapshot, actions }) => (
              <li key={snapshot.system.id} className="py-2">
                <Link
                  className="text-accent hover:underline"
                  href={`/inventory/${snapshot.system.id}`}
                >
                  {snapshot.system.name}
                </Link>
                <p className="text-sm text-secondary">
                  {actions.map((a) => d(`checks.${a.id}.label`)).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          <Link
            className="text-sm text-accent hover:underline"
            href="/inventory"
          >
            {t("all")}
          </Link>
        </div>
      </div>
    </section>
  );
}
