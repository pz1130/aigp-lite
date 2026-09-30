import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { VendorNewClient } from "@/components/vendor/VendorNewClient";
import { getTranslations } from "next-intl/server";

export default async function NewVendorPage() {
  await requireSession();
  const t = await getTranslations("vendor");
  return (
    <>
      <PageHeader title={t("createTitle")} />
      <VendorNewClient />
    </>
  );
}
