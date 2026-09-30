import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import {
  ControlList,
  type ControlListFramework,
  type ControlStatusById,
} from "@/components/risk/ControlList";
import { AssessmentForm } from "@/components/risk/AssessmentForm";
import { PageHeader } from "@/components/page/PageHeader";
import { DetailLayout } from "@/components/page/DetailLayout";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { GenerateAssessmentPdfButton } from "@/components/risk/GenerateAssessmentPdfButton";

const severityToVariant = (
  level: string,
): "danger" | "warn" | "success" | "critical" => {
  if (level === "critical") return "critical";
  if (level === "high") return "danger";
  if (level === "medium") return "warn";
  return "success";
};

/** Short proper-noun labels for each catalog source (not translated). */
const CATALOG_SOURCE_LABEL: Record<string, string> = {
  FINOS_AIGF: "FINOS AIGF",
  MITRE_ATLAS: "MITRE ATLAS",
  NIST_AI_RMF: "NIST AI RMF",
  ISO_42001: "ISO 42001",
  EU_AI_ACT: "EU AI Act",
  custom: "Custom",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default async function UsecaseAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("risk");

  const [
    usecase,
    frameworks,
    controlStatuses,
    latestAssessment,
    classification,
    catalogLinks,
  ] = await Promise.all([
    db.aiUsecase.findUnique({ where: { id } }),
    db.riskFramework.findMany({
      include: { controls: true },
      orderBy: { code: "asc" },
    }),
    db.usecaseControlStatus.findMany({
      where: { usecaseId: id },
      include: { control: { include: { framework: true } } },
    }),
    db.usecaseRiskAssessment.findFirst({
      where: { usecaseId: id },
      orderBy: { assessedAt: "desc" },
    }),
    db.usecaseClassification.findUnique({ where: { usecaseId: id } }),
    db.usecaseCatalogRiskLink.findMany({
      where: { usecaseId: id },
      include: { risk: true },
    }),
  ]);

  if (!usecase) notFound();

  const statusByControl: ControlStatusById = {};
  for (const cs of controlStatuses) {
    statusByControl[cs.controlId] = cs.status;
  }

  const tCls = await getTranslations("inventory.classification");
  type SuggestedRisk = {
    title: string;
    severity: "low" | "medium" | "high";
    rationale: string;
  };
  const suggestedRisks: SuggestedRisk[] = Array.isArray(
    classification?.suggestedRisks,
  )
    ? (classification!.suggestedRisks as unknown as SuggestedRisk[])
    : [];

  const sortedCatalogLinks = [...catalogLinks].sort((a, b) => {
    const bySeverity =
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (bySeverity !== 0) return bySeverity;
    return (
      a.risk.source.localeCompare(b.risk.source) ||
      a.risk.code.localeCompare(b.risk.code)
    );
  });

  const main = (
    <div className="space-y-6">
      <div>
        <p className="text-small text-secondary">
          {t("autonomyLabel")}: {t(`autonomy.${usecase.autonomyLevel}`)}
        </p>
      </div>

      {latestAssessment && (
        <div className="rounded-lg border border-border-default bg-surface p-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs uppercase tracking-wide text-secondary">
                {t("latest")} {t("score")}
              </span>
              <p className="text-2xl font-bold text-primary">
                {latestAssessment.scoreInt}
              </p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide text-secondary">
                {t("levelLabel")}
              </span>
              <p className="text-lg font-semibold">
                <Badge variant={severityToVariant(latestAssessment.level)}>
                  {t(`level.${latestAssessment.level}`)}
                </Badge>
              </p>
            </div>
            {latestAssessment.pdfFileKey ? (
              <div>
                <a
                  href={`/api/risk/assessment/${latestAssessment.id}/pdf`}
                  className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  <Download size={14} />
                  {t("downloadReport")}
                </a>
              </div>
            ) : (
              <div>
                <GenerateAssessmentPdfButton
                  assessmentId={latestAssessment.id}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {suggestedRisks.length > 0 && (
        <section className="rounded-lg border border-border-default bg-surface p-4">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-primary">
              {tCls("field.suggestedRisks")}
            </h2>
            <p className="text-xs text-tertiary">{tCls("description")}</p>
          </div>
          <ul className="space-y-2">
            {suggestedRisks.map((r, i) => (
              <li
                key={i}
                className="rounded border border-border-default bg-muted p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-primary">
                    {r.title}
                  </span>
                  <Badge
                    variant={
                      r.severity === "high"
                        ? "danger"
                        : r.severity === "medium"
                          ? "warn"
                          : "neutral"
                    }
                    size="sm"
                  >
                    {tCls(`severity.${r.severity}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-secondary">{r.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border-default bg-surface p-4">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-primary">
            {t("catalogRisks.title")}
          </h2>
          <p className="text-xs text-tertiary">{t("catalogRisks.subtitle")}</p>
        </div>
        {sortedCatalogLinks.length === 0 ? (
          <p className="text-sm text-tertiary">{t("catalogRisks.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {sortedCatalogLinks.map((l) => (
              <li
                key={l.id}
                className="rounded border border-border-default bg-muted p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="neutral" size="sm">
                      {CATALOG_SOURCE_LABEL[l.risk.source] ?? l.risk.source}
                    </Badge>
                    <span className="text-sm font-medium text-primary truncate">
                      {l.risk.title}
                    </span>
                    <code className="text-xs text-tertiary shrink-0">
                      {l.risk.code}
                    </code>
                  </div>
                  <Badge variant={severityToVariant(l.severity)} size="sm">
                    {t(`catalogRisks.severity.${l.severity}`)}
                  </Badge>
                </div>
                {l.rationale ? (
                  <p className="mt-1 text-xs text-secondary">{l.rationale}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ControlList
        usecaseId={id}
        frameworks={frameworks satisfies ControlListFramework[]}
        statusByControl={statusByControl}
      />
    </div>
  );

  const aside = <AssessmentForm usecaseId={id} />;

  return (
    <>
      <PageHeader
        title={usecase.name}
        breadcrumb={
          <Link href="/risk" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <DetailLayout main={main} aside={aside} />
    </>
  );
}
