"use client";

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

export function LinkedRisksPanel({
  usecaseId,
  canWrite,
}: {
  usecaseId: string;
  canWrite: boolean;
}) {
  const t = useTranslations("riskCopilot.linked");
  const utils = trpc.useUtils();
  const q = trpc.riskCopilot.linkedRisks.useQuery({ usecaseId });
  const unlink = trpc.riskCopilot.unlink.useMutation({
    onSuccess: () => utils.riskCopilot.linkedRisks.invalidate({ usecaseId }),
  });

  return (
    <Card>
      <CardBody className="space-y-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {(q.data?.length ?? 0) === 0 && (
          <p className="text-sm text-tertiary">{t("empty")}</p>
        )}
        <ul className="space-y-2">
          {q.data?.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between border rounded p-2"
            >
              <div>
                <Badge variant={SEVERITY_VARIANT[l.severity] ?? "neutral"}>
                  {l.severity}
                </Badge>
                <span className="ml-2 font-medium">{l.risk.title}</span>
                <code className="ml-2 text-xs text-tertiary">
                  {l.risk.code}
                </code>
                <span className="ml-2 text-xs">
                  ({t(`source.${l.source}`)})
                </span>
              </div>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unlink.mutateAsync({ linkId: l.id })}
                >
                  {t("remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
