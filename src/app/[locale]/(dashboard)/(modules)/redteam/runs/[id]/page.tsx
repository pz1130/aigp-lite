import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { RunDetail } from "@/components/redteam/RunDetail";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireSession();
  const canWrite = hasPermission(ctx.role, "redteam.write");
  const t = await getTranslations("redteam");
  return (
    <>
      <PageHeader
        title={t("run.detailTitle")}
        breadcrumb={
          <Link
            href="/redteam/runs"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
      />
      <RunDetail id={id} canWrite={canWrite} />
    </>
  );
}
