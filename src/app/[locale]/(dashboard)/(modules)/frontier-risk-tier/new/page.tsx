import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { FrtNewClient } from "@/components/frontier-risk-tier/NewClient";
import { getTranslations } from "next-intl/server";

export default async function NewFrtPage() {
  await requireSession();
  const t = await getTranslations("frontierRiskTier");
  return (
    <>
      <PageHeader title={t("createTitle")} />
      <FrtNewClient />
    </>
  );
}
