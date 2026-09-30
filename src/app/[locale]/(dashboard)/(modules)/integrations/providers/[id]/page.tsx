import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { ProviderConnectionDetail } from "@/components/integrations/providers/ProviderConnectionDetail";

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("provider");
  return (
    <>
      <PageHeader
        title={t("connection.title")}
        breadcrumb={
          <Link
            href="/integrations/providers"
            className="text-secondary hover:text-primary"
          >
            {t("connection.title")}
          </Link>
        }
      />
      <ProviderConnectionDetail id={id} />
    </>
  );
}
