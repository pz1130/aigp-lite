import { Link } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { ModelCard } from "@/components/inventory/ModelCard";
import { ModelVersions } from "@/components/inventory/ModelVersions";
import { UsecaseClassificationCard } from "@/components/inventory/UsecaseClassificationCard";
import { UsecaseMaterialityCard } from "@/components/inventory/UsecaseMaterialityCard";
import { UsecaseFairnessCard } from "@/components/inventory/UsecaseFairnessCard";
import { UsecaseVendorsCard } from "@/components/inventory/UsecaseVendorsCard";
import { PageHeader } from "@/components/page/PageHeader";
import { DetailLayout } from "@/components/page/DetailLayout";
import { Badge } from "@/components/ui/badge";
import { UsecaseDataSourcesSection } from "@/components/data-lineage/UsecaseDataSourcesSection";
import { FriaTab } from "@/components/fria/FriaTab";
import { formatDate } from "@/lib/format/intl";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { DeleteUsecaseButton } from "@/components/inventory/DeleteUsecaseButton";
import { hasPermission } from "@/lib/rbac/check";
import { RiskCopilotPanel } from "./RiskCopilotPanel";
import { LinkedRisksPanel } from "./LinkedRisksPanel";
import { RedteamAttestationsPanel } from "./RedteamAttestationsPanel";
import { buildDossierSnapshot } from "@/lib/dossier/aggregate";
import { evaluateReadiness } from "@/lib/dossier/readiness";
import { recheckStaleApproval } from "@/lib/dossier/stale-approval";
import { ReadinessBanner } from "./_dossier/ReadinessBanner";
import { ReadinessChecklist } from "./_dossier/ReadinessChecklist";
import { GoLivePanel } from "./_dossier/GoLivePanel";
import { SystemCardExport } from "./_dossier/SystemCardExport";
import { DeprecatePanel } from "./_dossier/DeprecatePanel";
import { daysToSunset } from "@/lib/inventory/sunset";

export default async function UsecaseDetail({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  await recheckStaleApproval(db, ctx.orgId, id, {
    triggeredByUserId: ctx.userId,
  });
  const snapshot = await buildDossierSnapshot(db, ctx.orgId, id);
  if (!snapshot) notFound();
  const sys = snapshot.system;
  const readiness = evaluateReadiness(snapshot);
  const canApprove = hasPermission(ctx.role, "go-live.approve");
  const canAttest = hasPermission(ctx.role, "inventory.write");
  const t = await getTranslations("inventory");

  const main = (
    <>
      <ReadinessBanner readiness={readiness} capability={snapshot.capability} />
      <div className="flex justify-end">
        <SystemCardExport usecaseId={id} />
      </div>
      <section className="space-y-3">
        <ReadinessChecklist readiness={readiness} />
      </section>

      <section className="space-y-4">
        {sys.description && <p className="text-secondary">{sys.description}</p>}
        <h2 className="text-lg font-semibold">{t("fields.modelCard")}</h2>
        <ModelCard md={sys.modelCardMd} emptyText={t("noModelCard")} />
        <ModelVersions usecaseId={id} />
      </section>

      <UsecaseClassificationCard usecaseId={id} />

      <UsecaseMaterialityCard
        usecaseId={id}
        canWrite={hasPermission(ctx.role, "materiality.write")}
      />

      <UsecaseFairnessCard
        usecaseId={id}
        canWrite={hasPermission(ctx.role, "fairness.write")}
      />

      <UsecaseVendorsCard usecaseId={id} />

      <UsecaseDataSourcesSection usecaseId={id} />

      <RiskCopilotPanel
        usecaseId={id}
        canWrite={hasPermission(ctx.role, "risk.write")}
        descriptionLength={(sys.description ?? "").length}
      />
      <LinkedRisksPanel
        usecaseId={id}
        canWrite={hasPermission(ctx.role, "risk.write")}
      />

      <FriaTab usecaseId={id} />

      <RedteamAttestationsPanel
        usecaseId={id}
        canWrite={hasPermission(ctx.role, "redteam.write")}
      />

      <section className="rounded-lg border border-border-default p-4">
        <Link
          href="/aivtf"
          className="text-accent hover:underline text-sm font-medium"
        >
          AIVTF Checklist →
        </Link>
      </section>
    </>
  );

  const aside = (
    <div className="space-y-4">
      {sys.lifecycleStage === "deprecated" ? (
        <div className="space-y-2 rounded-lg border border-warn-subtle bg-warn-subtle/40 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="warn">{t("stages.deprecated")}</Badge>
            <span className="font-semibold">{t("deprecate.bannerTitle")}</span>
          </div>
          {sys.deprecatedByName && sys.deprecatedAt && (
            <p className="text-small text-secondary">
              {t("deprecate.deprecatedBy", {
                name: sys.deprecatedByName,
                date: formatDate(new Date(sys.deprecatedAt), locale),
              })}
            </p>
          )}
          {sys.deprecationReason && (
            <p className="text-sm">{sys.deprecationReason}</p>
          )}
          {(() => {
            const d = daysToSunset(
              sys.sunsetDate ? new Date(sys.sunsetDate) : null,
            );
            if (d === null)
              return (
                <p className="text-small text-tertiary">
                  {t("deprecate.noSunset")}
                </p>
              );
            const line =
              d > 0
                ? t("sunset.daysLeft", { days: d })
                : d < 0
                  ? t("sunset.overdue", { days: -d })
                  : t("sunset.today");
            return <p className="text-small font-medium text-warn">{line}</p>;
          })()}
        </div>
      ) : (
        canAttest && <DeprecatePanel usecaseId={sys.id} />
      )}
      <GoLivePanel
        usecaseId={snapshot.system.id}
        readiness={readiness}
        current={snapshot.goLive}
        oversightAttested={snapshot.system.humanOversightAttested}
        canApprove={canApprove}
        canAttest={canAttest}
      />

      <div className="rounded-lg border border-border-default p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-small text-secondary">
            {t("fields.lifecycleStage")}
          </span>
          <Badge
            variant={
              sys.lifecycleStage === "production"
                ? "success"
                : sys.lifecycleStage === "deprecated"
                  ? "warn"
                  : "neutral"
            }
          >
            {t(`stages.${sys.lifecycleStage}`)}
          </Badge>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-tertiary text-small">
              {t("fields.autonomyLevel")}
            </dt>
            <dd className="font-medium">
              {t(`autonomy.${sys.autonomyLevel}`)}
            </dd>
          </div>
          <div>
            <dt className="text-tertiary text-small">
              {t("fields.deploymentType")}
            </dt>
            <dd className="font-medium">{t(`deploy.${sys.deploymentType}`)}</dd>
          </div>
          {sys.ownerId && (
            <div>
              <dt className="text-tertiary text-small">{t("fields.owner")}</dt>
              <dd className="font-medium">{sys.ownerId}</dd>
            </div>
          )}
          <div>
            <dt className="text-tertiary text-small">Last updated</dt>
            <dd className="text-secondary text-small">
              {formatDate(new Date(sys.updatedAt), locale)}
            </dd>
          </div>
        </dl>
        <div className="pt-2 flex gap-2">
          <Link href={`/inventory/${id}/edit`}>
            <Button variant="secondary" size="sm">
              <Pencil size={14} />
              {t("edit")}
            </Button>
          </Link>
          <DeleteUsecaseButton id={id} name={sys.name} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title={sys.name}
        breadcrumb={
          <Link href="/inventory" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <DetailLayout main={main} aside={aside} />
    </>
  );
}
