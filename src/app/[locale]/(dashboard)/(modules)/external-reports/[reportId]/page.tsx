import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { getTranslations } from "next-intl/server";
import { DetailClient } from "@/components/external-reports/DetailClient";

export default async function ExternalReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  await requireSession();
  const { reportId } = await params;
  const t = await getTranslations("externalReports");
  return (
    <>
      <PageHeader title={t("detailTitle")} />
      <DetailClient reportId={reportId} />
    </>
  );
}
