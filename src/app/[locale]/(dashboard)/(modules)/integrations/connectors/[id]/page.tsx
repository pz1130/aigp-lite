import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { ConnectorDetail } from "@/components/integrations/connectors/ConnectorDetail";

export default async function ConnectorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("integrations");
  return (
    <>
      <PageHeader
        title={t("connector.title")}
        breadcrumb={
          <Link
            href="/integrations/connectors"
            className="text-secondary hover:text-primary"
          >
            {t("connector.title")}
          </Link>
        }
      />
      <ConnectorDetail id={id} />
    </>
  );
}
