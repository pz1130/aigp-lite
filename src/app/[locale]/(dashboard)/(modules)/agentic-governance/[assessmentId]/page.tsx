import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AgChkDetailClient } from "@/components/agentic-governance/DetailClient";
import { getTranslations } from "next-intl/server";

export default async function AgChkDetailPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  await requireSession();
  const t = await getTranslations("agenticGovernance");
  return (
    <>
      <PageHeader title={t("title")} />
      <AgChkDetailClient id={assessmentId} />
    </>
  );
}
