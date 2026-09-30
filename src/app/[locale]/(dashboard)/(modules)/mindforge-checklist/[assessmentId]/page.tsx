import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { MfChecklistDetailClient } from "@/components/mf-checklist/MfChecklistDetailClient";
import { getTranslations } from "next-intl/server";

export default async function MfChecklistDetailPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  await requireSession();
  const t = await getTranslations("mindforgeChecklist");
  return (
    <>
      <PageHeader title={t("title")} />
      <MfChecklistDetailClient id={assessmentId} />
    </>
  );
}
