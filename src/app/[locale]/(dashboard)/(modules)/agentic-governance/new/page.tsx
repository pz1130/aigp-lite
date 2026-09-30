import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { AgChkNewClient } from "@/components/agentic-governance/NewClient";
import { getTranslations } from "next-intl/server";

export default async function NewAgChkPage() {
  await requireSession();
  const t = await getTranslations("agenticGovernance");
  return (
    <>
      <PageHeader title={t("createTitle")} />
      <AgChkNewClient />
    </>
  );
}
