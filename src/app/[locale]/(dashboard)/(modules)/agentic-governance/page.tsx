import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AgChkListClient } from "@/components/agentic-governance/ListClient";
import { getTranslations } from "next-intl/server";

export default async function AgChkListPage() {
  await requireSession();
  const t = await getTranslations("agenticGovernance");
  return (
    <>
      <PageHeader title={t("listTitle")} />
      <AgChkListClient />
    </>
  );
}
