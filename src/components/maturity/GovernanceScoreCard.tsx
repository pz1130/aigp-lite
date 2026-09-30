"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/_utils/cn";

const TONE = (score: number) =>
  score >= 70 ? "text-success" : score >= 40 ? "text-warn" : "text-danger";

const BAR_COLOR = (score: number) =>
  score >= 70 ? "bg-success" : score >= 40 ? "bg-warn" : "bg-danger";

export function GovernanceScoreCard() {
  const t = useTranslations("governance");
  const { data, isLoading } = trpc.governance.score.useQuery();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("score")}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="text-secondary text-sm">{t("noData")}</div>
        </CardBody>
      </Card>
    );
  }

  const { overall, dimensions } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("score")}</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="flex items-center gap-6 mb-6">
          <div className={cn("text-5xl font-bold tabular-nums", TONE(overall))}>
            {overall}
          </div>
          <div className="text-secondary text-sm">/ 100</div>
        </div>

        <div className="space-y-3">
          {dimensions.map((d) => (
            <div key={d.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-secondary">
                  {t(`dimensions.${d.key}`)}
                </span>
                <span className={cn("font-medium tabular-nums", TONE(d.score))}>
                  {d.score}
                </span>
              </div>
              <div className="h-2 rounded-full bg-subtle overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    BAR_COLOR(d.score),
                  )}
                  style={{ width: `${d.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
