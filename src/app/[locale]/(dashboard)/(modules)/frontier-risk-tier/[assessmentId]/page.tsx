import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { FrtDetailClient } from "@/components/frontier-risk-tier/DetailClient";
import { getTranslations } from "next-intl/server";

export default async function FrtDetailPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  await requireSession();
  const t = await getTranslations("frontierRiskTier");
  return (
    <>
      <PageHeader title={t("title")} />
      <FrtDetailClient id={assessmentId} />
    </>
  );
}
