import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { ProviderConnectionList } from "@/components/integrations/providers/ProviderConnectionList";

export default async function ProvidersPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("provider.connection.title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
      />
      <ProviderConnectionList />
    </>
  );
}
