import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AivtfListClient } from "@/components/aivtf/AivtfListClient";
import { getTranslations } from "next-intl/server";

export default async function AivtfListPage() {
  await requireSession();
  const t = await getTranslations("aivtf");
  return (
    <>
      <PageHeader title={t("listTitle")} />
      <AivtfListClient />
    </>
  );
}
