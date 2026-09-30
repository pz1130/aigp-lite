import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AivtfDetailClient } from "@/components/aivtf/AivtfDetailClient";
import { getTranslations } from "next-intl/server";

export default async function AivtfDetailPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  await requireSession();
  const t = await getTranslations("aivtf");
  return (
    <>
      <PageHeader title={t("title")} />
      <AivtfDetailClient id={assessmentId} />
    </>
  );
}
