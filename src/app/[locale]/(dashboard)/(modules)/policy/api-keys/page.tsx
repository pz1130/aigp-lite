import Link from "next/link";
import { ApiKeyManager } from "@/components/policy/ApiKeyManager";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page";

export default async function ApiKeysPage() {
  const t = await getTranslations("policy");
  return (
    <>
      <PageHeader
        title={t("apiKeys")}
        breadcrumb={
          <Link href="/policy" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <ApiKeyManager />
    </>
  );
}
