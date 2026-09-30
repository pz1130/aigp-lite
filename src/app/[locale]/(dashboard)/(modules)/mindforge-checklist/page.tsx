import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { MfChecklistListClient } from "@/components/mf-checklist/MfChecklistListClient";
import { getTranslations } from "next-intl/server";

export default async function MfChecklistListPage() {
  await requireSession();
  const t = await getTranslations("mindforgeChecklist");
  return (
    <>
      <PageHeader title={t("listTitle")} />
      <MfChecklistListClient />
    </>
  );
}
