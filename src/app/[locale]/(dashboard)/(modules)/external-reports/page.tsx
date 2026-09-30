import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { getTranslations } from "next-intl/server";
import { QueueClient } from "@/components/external-reports/QueueClient";

export default async function ExternalReportsPage() {
  await requireSession();
  const t = await getTranslations("externalReports");
  return (
    <>
      <PageHeader title={t("queueTitle")} />
      <QueueClient />
    </>
  );
}
