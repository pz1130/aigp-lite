import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { PageHeader } from "@/components/page/PageHeader";
import { ItListClient } from "@/components/incident-trends/ListClient";
import { getTranslations } from "next-intl/server";

export default async function ItListPage() {
  const ctx = await requireSession();
  const canWrite = hasPermission(ctx.role, "incident-trends.write");
  const t = await getTranslations("incidentTrends");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ItListClient canWrite={canWrite} />
    </>
  );
}
