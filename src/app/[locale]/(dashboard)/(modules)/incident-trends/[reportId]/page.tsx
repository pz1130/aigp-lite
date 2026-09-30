import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { PageHeader } from "@/components/page/PageHeader";
import { Link } from "@/i18n/routing";
import { ItDetailClient } from "@/components/incident-trends/DetailClient";
import { getTranslations } from "next-intl/server";

export default async function ItDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const ctx = await requireSession();
  const canWrite = hasPermission(ctx.role, "incident-trends.write");
  const { reportId } = await params;
  const t = await getTranslations("incidentTrends");
  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link
            href="/incident-trends"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
      />
      <ItDetailClient id={reportId} canWrite={canWrite} />
    </>
  );
}
