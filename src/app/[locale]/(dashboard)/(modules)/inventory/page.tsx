import { Link } from "@/i18n/routing";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import {
  UsecaseTable,
  type UsecaseTableRow,
} from "@/components/inventory/UsecaseTable";
import { AnalyzeAllButton } from "@/components/inventory/AnalyzeAllButton";
import { PageHeader } from "@/components/page/PageHeader";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const rows = await db.aiUsecase.findMany({
    include: {
      classification: {
        select: {
          euAiActCategory: true,
          dataSensitivity: true,
          confidence: true,
          generatedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const t = await getTranslations("inventory");
  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={
          <div className="flex items-center gap-2">
            <AnalyzeAllButton />
            <Link href="/inventory/new">
              <Button size="sm">+ {t("new")}</Button>
            </Link>
          </div>
        }
      />
      <UsecaseTable rows={rows satisfies UsecaseTableRow[]} locale={locale} />
    </>
  );
}
