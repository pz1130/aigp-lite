import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { TrustCenterAdminClient } from "@/components/trust-center/AdminClient";
import { getTranslations } from "next-intl/server";

export default async function TrustCenterPage() {
  await requireSession();
  const t = await getTranslations("trustCenter.admin");
  return (
    <>
      <PageHeader title={t("title")} />
      <TrustCenterAdminClient />
    </>
  );
}
