import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AsiChkListClient } from "@/components/asi-redteam-checklist/ListClient";
import { getTranslations } from "next-intl/server";

export default async function AsiChkListPage() {
  await requireSession();
  const t = await getTranslations("asiRedteamChecklist");
  return (
    <>
      <PageHeader title={t("listTitle")} />
      <AsiChkListClient />
    </>
  );
}
