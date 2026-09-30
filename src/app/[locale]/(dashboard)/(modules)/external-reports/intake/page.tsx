import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { getTranslations } from "next-intl/server";
import { IntakeClient } from "@/components/external-reports/IntakeClient";

export default async function ExternalReportsIntakePage() {
  await requireSession();
  const t = await getTranslations("externalReports");
  return (
    <>
      <PageHeader title={t("intake.title")} />
      <IntakeClient />
    </>
  );
}
