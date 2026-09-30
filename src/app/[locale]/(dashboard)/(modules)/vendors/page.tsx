import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { VendorListClient } from "@/components/vendor/VendorListClient";
import { getTranslations } from "next-intl/server";

export default async function VendorListPage() {
  await requireSession();
  const t = await getTranslations("vendor");
  return (
    <>
      <PageHeader title={t("listTitle")} />
      <VendorListClient />
    </>
  );
}
