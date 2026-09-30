import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AuditIntegrityPanel } from "@/components/audit/AuditIntegrityPanel";
import { getTranslations } from "next-intl/server";

export default async function AuditIntegrityPage() {
  await requireSession();
  const t = await getTranslations("audit.integrity");
  return (
    <>
      <PageHeader title={t("title")} />
      <AuditIntegrityPanel />
    </>
  );
}
