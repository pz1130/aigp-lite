import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AsiChkNewClient } from "@/components/asi-redteam-checklist/NewClient";
import { getTranslations } from "next-intl/server";

export default async function NewAsiChkPage() {
  await requireSession();
  const t = await getTranslations("asiRedteamChecklist");
  return (
    <>
      <PageHeader title={t("createTitle")} />
      <AsiChkNewClient />
    </>
  );
}
