import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AivtfNewClient } from "@/components/aivtf/AivtfNewClient";
import { getTranslations } from "next-intl/server";

export default async function NewAivtfPage() {
  await requireSession();
  const t = await getTranslations("aivtf");
  return (
    <>
      <PageHeader title={t("createTitle")} />
      <AivtfNewClient />
    </>
  );
}
