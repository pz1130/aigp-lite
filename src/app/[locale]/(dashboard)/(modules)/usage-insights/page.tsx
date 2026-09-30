import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { PageHeader } from "@/components/page/PageHeader";
import { UiListClient } from "@/components/usage-insights/ListClient";
import { getTranslations } from "next-intl/server";

export default async function UsageInsightsListPage() {
  const ctx = await requireSession();
  const canWrite = hasPermission(ctx.role, "usage-insights.write");
  const t = await getTranslations("usageInsights");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <UiListClient canWrite={canWrite} />
    </>
  );
}
