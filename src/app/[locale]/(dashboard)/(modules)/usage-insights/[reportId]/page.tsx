import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { PageHeader } from "@/components/page/PageHeader";
import { Link } from "@/i18n/routing";
import { UiDetailClient } from "@/components/usage-insights/DetailClient";
import { getTranslations } from "next-intl/server";

export default async function UsageInsightsDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const ctx = await requireSession();
  const canWrite = hasPermission(ctx.role, "usage-insights.write");
  const { reportId } = await params;
  const t = await getTranslations("usageInsights");
  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link
            href="/usage-insights"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
      />
      <UiDetailClient id={reportId} canWrite={canWrite} />
    </>
  );
}
