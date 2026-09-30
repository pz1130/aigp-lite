import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { getTranslations } from "next-intl/server";
import { DetailClient } from "@/components/alignment-audit/DetailClient";

export default async function AlignmentAuditDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  await requireSession();
  const t = await getTranslations("alignmentAudit");
  return (
    <div>
      <PageHeader title={t("title")} />
      <DetailClient auditId={id} />
    </div>
  );
}
