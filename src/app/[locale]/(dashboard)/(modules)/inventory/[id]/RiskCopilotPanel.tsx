"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";

const SEVERITY_VARIANT: Record<
  string,
  "info" | "warn" | "danger" | "critical"
> = {
  low: "info",
  medium: "warn",
  high: "danger",
  critical: "critical",
};

type Props = {
  usecaseId: string;
  canWrite: boolean;
  descriptionLength: number;
};

export function RiskCopilotPanel({
  usecaseId,
  canWrite,
  descriptionLength,
}: Props) {
  const t = useTranslations("riskCopilot");
  const utils = trpc.useUtils();
  const latest = trpc.riskCopilot.latest.useQuery({ usecaseId });
  const isEnabled = trpc.riskCopilot.isEnabled.useQuery();
  const suggest = trpc.riskCopilot.suggest.useMutation({
    onSuccess: () => {
      utils.riskCopilot.latest.invalidate({ usecaseId });
      utils.riskCopilot.linkedRisks.invalidate({ usecaseId });
    },
  });
  const decide = trpc.riskCopilot.decide.useMutation({
    onSuccess: () => {
      utils.riskCopilot.latest.invalidate({ usecaseId });
      utils.riskCopilot.linkedRisks.invalidate({ usecaseId });
    },
  });
  const bulkDecide = trpc.riskCopilot.bulkDecide.useMutation({
    onSuccess: () => {
      utils.riskCopilot.latest.invalidate({ usecaseId });
      utils.riskCopilot.linkedRisks.invalidate({ usecaseId });
    },
  });

  const [error, setError] = useState<string | null>(null);

  const tooShort = descriptionLength < 20;
  const disabled =
    !canWrite || tooShort || !isEnabled.data?.enabled || suggest.isPending;
  const reason = !canWrite
    ? t("disabledRbac")
    : tooShort
      ? t("disabledShort")
      : isEnabled.data && !isEnabled.data.enabled
        ? t("disabledConfig")
        : null;

  const onSuggest = async () => {
    setError(null);
    try {
      await suggest.mutateAsync({ usecaseId });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const allItems = latest.data?.items ?? [];
  const pendingItems = allItems.filter((i) => i.decision === "pending");

  return (
    <Card>
      <CardBody className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <Button onClick={onSuggest} disabled={disabled}>
            {suggest.isPending
              ? t("running")
              : latest.data
                ? t("rerun")
                : t("suggestButton")}
          </Button>
        </header>
        <p className="text-sm text-secondary">{t("intro")}</p>
        {reason && <p className="text-xs text-warn">{reason}</p>}

        {latest.data && (
          <div className="space-y-2">
            <div className="text-xs text-tertiary">
              {t("lastRun")}:{" "}
              {new Date(latest.data.requestedAt).toLocaleString()} ·{" "}
              {t("tokens", {
                input: latest.data.inputTokens,
                output: latest.data.outputTokens,
                ms: latest.data.latencyMs,
                model: latest.data.model,
              })}
              <Badge variant="neutral" className="ml-2">
                {latest.data.status}
              </Badge>
            </div>

            {(
              latest.data.diagnostics as Array<{
                code: string;
                message: string;
              }>
            )?.length > 0 && (
              <details className="text-xs">
                <summary>{t("diagnostics")}</summary>
                <ul className="ml-4 list-disc">
                  {(
                    latest.data.diagnostics as Array<{
                      code: string;
                      message: string;
                    }>
                  ).map((d, i) => (
                    <li key={i}>
                      <code>{d.code}</code>: {d.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {allItems.length === 0 && (
              <p className="text-sm">{t("noResults")}</p>
            )}

            {pendingItems.length > 0 && canWrite && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    bulkDecide.mutateAsync({
                      suggestionId: latest.data!.id,
                      accepts: pendingItems.map((i) => i.id),
                      rejects: [],
                    })
                  }
                >
                  {t("acceptAll")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    bulkDecide.mutateAsync({
                      suggestionId: latest.data!.id,
                      accepts: [],
                      rejects: pendingItems.map((i) => i.id),
                    })
                  }
                >
                  {t("rejectAll")}
                </Button>
              </div>
            )}

            <ul className="space-y-3">
              {allItems.map((item) => (
                <li key={item.id} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge
                        variant={SEVERITY_VARIANT[item.severity] ?? "neutral"}
                      >
                        {t(`severity.${item.severity}`)}
                      </Badge>
                      <span className="ml-2 font-medium">
                        {item.risk?.title}
                      </span>
                      <code className="ml-2 text-xs text-tertiary">
                        {item.risk?.code}
                      </code>
                    </div>
                    <div className="text-xs text-tertiary">{item.decision}</div>
                  </div>
                  <p className="text-sm mt-2">
                    <strong>{t("rationale")}:</strong> {item.rationale}
                  </p>
                  <p className="text-xs italic mt-1">
                    <strong>{t("evidence")}:</strong> &quot;{item.evidenceQuote}
                    &quot;
                  </p>
                  <p className="text-xs mt-1">
                    <strong>{t("mitigations")}:</strong>{" "}
                    {((item.mitigationIds as string[]) ?? []).join(", ") || "—"}
                  </p>
                  {canWrite && item.decision === "pending" && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          decide.mutateAsync({
                            itemId: item.id,
                            decision: "accepted",
                          })
                        }
                      >
                        {t("acceptOne")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          decide.mutateAsync({
                            itemId: item.id,
                            decision: "rejected",
                          })
                        }
                      >
                        {t("rejectOne")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardBody>
    </Card>
  );
}
