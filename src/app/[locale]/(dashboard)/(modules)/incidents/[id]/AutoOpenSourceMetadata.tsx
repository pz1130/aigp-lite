"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function AutoOpenSourceMetadata({
  evaluationId,
  openedAt,
}: {
  evaluationId: string;
  openedAt: Date;
}) {
  const t = useTranslations("incident.automation");
  return (
    <div className="text-xs text-neutral-600 dark:text-neutral-400">
      🤖 {t("source_policy_evaluation")}{" "}
      <Link href={`/policy/evaluations/${evaluationId}`} className="underline">
        #{evaluationId.slice(0, 7)}
      </Link>{" "}
      ({t("auto_opened_at", { ts: openedAt.toISOString() })})
    </div>
  );
}
