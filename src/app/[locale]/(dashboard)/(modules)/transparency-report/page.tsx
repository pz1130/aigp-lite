import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { TxrListClient } from "@/components/transparency-report/ListClient";
import { getTranslations } from "next-intl/server";

export default async function TxrListPage() {
  await requireSession();
  const t = await getTranslations("transparencyReport");
  return (
    <>
      <PageHeader title={t("listTitle")} />
      <TxrListClient />
    </>
  );
}
