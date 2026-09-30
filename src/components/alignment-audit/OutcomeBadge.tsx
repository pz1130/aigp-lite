import { useTranslations } from "next-intl";

export function OutcomeBadge({
  status,
  outcome,
}: {
  status: string;
  outcome: string | null;
}) {
  const t = useTranslations("alignmentAudit");
  if (status !== "completed") {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        {status === "running" || status === "pending" ? t("running") : status}
      </span>
    );
  }
  const label =
    outcome === "pass"
      ? t("pass")
      : outcome === "concerns"
        ? t("concerns")
        : outcome === "fail"
          ? t("fail")
          : (outcome ?? "—");
  const color =
    outcome === "pass"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : outcome === "concerns"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        : outcome === "fail"
          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
