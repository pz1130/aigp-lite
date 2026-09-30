import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { FrtListClient } from "@/components/frontier-risk-tier/ListClient";
import { getTranslations } from "next-intl/server";

export default async function FrtListPage() {
  await requireSession();
  const t = await getTranslations("frontierRiskTier");
  return (
    <>
      <PageHeader title={t("listTitle")} />
      <FrtListClient />
    </>
  );
}
