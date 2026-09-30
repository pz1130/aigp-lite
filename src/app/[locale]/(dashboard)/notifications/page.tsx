import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { NotificationsPageClient } from "@/components/notifications/NotificationsPageClient";

export default async function NotificationsPage() {
  const t = await getTranslations("notifications");
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <NotificationsPageClient />
    </div>
  );
}
