import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { TxrNewClient } from "@/components/transparency-report/NewClient";
import { getTranslations } from "next-intl/server";

export default async function NewTxrPage() {
  await requireSession();
  const t = await getTranslations("transparencyReport");
  return (
    <>
      <PageHeader title={t("createTitle")} />
      <TxrNewClient />
    </>
  );
}
