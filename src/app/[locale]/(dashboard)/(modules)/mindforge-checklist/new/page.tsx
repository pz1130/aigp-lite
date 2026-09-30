import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { MfChecklistNewClient } from "@/components/mf-checklist/MfChecklistNewClient";
import { getTranslations } from "next-intl/server";

export default async function NewMfChecklistPage() {
  await requireSession();
  const t = await getTranslations("mindforgeChecklist");
  return (
    <>
      <PageHeader title={t("createTitle")} />
      <MfChecklistNewClient />
    </>
  );
}
