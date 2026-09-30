"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const FRAMEWORK_BY_TAG: Record<string, string> = {
  EU_AI_ACT: "EU_AI_ACT",
  "EU AI ACT": "EU_AI_ACT",
  EUAIACT: "EU_AI_ACT",
  NIST_AI_RMF: "NIST_AI_RMF",
  "NIST AI RMF": "NIST_AI_RMF",
  NISTAIRMF: "NIST_AI_RMF",
  ISO_42001: "ISO_42001",
  "ISO 42001": "ISO_42001",
  ISO42001: "ISO_42001",
};

function frameworkLinkFor(tag: string): string | null {
  const key = tag.toUpperCase().replace(/[-/]/g, "_");
  return FRAMEWORK_BY_TAG[key] ?? FRAMEWORK_BY_TAG[tag.toUpperCase()] ?? null;
}

interface SuggestedRisk {
  title: string;
  severity: "low" | "medium" | "high";
  rationale: string;
}

export function UsecaseClassificationCard({
  usecaseId,
}: {
  usecaseId: string;
}) {
  const t = useTranslations("inventory.classification");
  const utils = trpc.useUtils();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const analyze = trpc.inventory.analyze.useMutation({
    onError(err) {
      setErrorMsg(err.message || t("error"));
    },
    async onSuccess() {
      setErrorMsg(null);
      await utils.inventory.classification.invalidate({ usecaseId });
    },
  });

  const { data, isLoading } = trpc.inventory.classification.useQuery({
    usecaseId,
  });

  async function onAnalyze() {
    setErrorMsg(null);
    await analyze.mutateAsync({ usecaseId });
  }

  return (
    <section className="rounded-lg border border-border-default bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-primary">{t("title")}</h2>
          <p className="text-small text-secondary">{t("description")}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAnalyze}
          disabled={analyze.isPending}
        >
          <Sparkles size={14} />
          {analyze.isPending ? t("queued") : data ? t("rerun") : t("run")}
        </Button>
      </div>

      {errorMsg && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {errorMsg}
        </div>
      )}

      {isLoading ? (
        <p className="text-small text-secondary">{t("loading")}</p>
      ) : !data ? (
        <p className="text-small text-tertiary">{t("empty")}</p>
      ) : (
        <div className="space-y-4">
          {data.summary && (
            <p className="text-small text-primary">{data.summary}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label={t("field.domain")} value={data.domain ?? "—"} />
            <Field
              label={t("field.dataSensitivity")}
              value={
                data.dataSensitivity
                  ? t(`sensitivity.${data.dataSensitivity}`)
                  : "—"
              }
            />
            <Field
              label={t("field.containsPii")}
              value={data.containsPii ? t("yes") : t("no")}
              badgeVariant={data.containsPii ? "warn" : "neutral"}
            />
            <Field
              label={t("field.adm")}
              value={data.automatedDecisionMaking ? t("yes") : t("no")}
              badgeVariant={data.automatedDecisionMaking ? "warn" : "neutral"}
            />
            <Field
              label={t("field.euAiAct")}
              value={
                data.euAiActCategory ? t(`euAct.${data.euAiActCategory}`) : "—"
              }
              badgeVariant={
                data.euAiActCategory === "prohibited" ||
                data.euAiActCategory === "high"
                  ? "danger"
                  : "neutral"
              }
            />
            <Field
              label={t("field.confidence")}
              value={
                data.confidence != null
                  ? `${Math.round(data.confidence * 100)}%`
                  : "—"
              }
            />
          </div>

          {data.complianceTags.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs text-tertiary">
                {t("field.complianceTags")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.complianceTags.map((tag) => {
                  const fwCode = frameworkLinkFor(tag);
                  const badge = (
                    <Badge
                      variant="info"
                      size="sm"
                      className={
                        fwCode ? "cursor-pointer hover:underline" : undefined
                      }
                    >
                      {tag}
                    </Badge>
                  );
                  return fwCode ? (
                    <Link key={tag} href={`/risk/frameworks/${fwCode}`}>
                      {badge}
                    </Link>
                  ) : (
                    <span key={tag}>{badge}</span>
                  );
                })}
              </div>
            </div>
          )}

          {Array.isArray(data.suggestedRisks) &&
            (data.suggestedRisks as unknown as SuggestedRisk[]).length > 0 && (
              <div>
                <div className="mb-1.5 text-xs text-tertiary">
                  {t("field.suggestedRisks")}
                </div>
                <ul className="space-y-2">
                  {(data.suggestedRisks as unknown as SuggestedRisk[]).map(
                    (r, i) => (
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
                            {t(`severity.${r.severity}`)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-secondary">
                          {r.rationale}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

          <p className="text-xs text-tertiary">
            {t("provenance", {
              provider: data.modelProvider ?? "?",
              model: data.modelName ?? "?",
              when: new Date(data.generatedAt).toLocaleString(),
              reason: t(`reason.${data.generatedReason}`),
            })}
          </p>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  badgeVariant,
}: {
  label: string;
  value: string;
  badgeVariant?: "neutral" | "info" | "warn" | "danger";
}) {
  return (
    <div>
      <div className="text-xs text-tertiary">{label}</div>
      {badgeVariant ? (
        <Badge variant={badgeVariant} size="sm" className="mt-0.5">
          {value}
        </Badge>
      ) : (
        <div className="font-medium text-primary">{value}</div>
      )}
    </div>
  );
}
