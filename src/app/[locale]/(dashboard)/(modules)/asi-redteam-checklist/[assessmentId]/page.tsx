import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AsiChkDetailClient } from "@/components/asi-redteam-checklist/DetailClient";
import { getTranslations } from "next-intl/server";

export default async function AsiChkDetailPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  await requireSession();
  const t = await getTranslations("asiRedteamChecklist");
  return (
    <>
      <PageHeader title={t("title")} />
      <AsiChkDetailClient id={assessmentId} />
    </>
  );
}
