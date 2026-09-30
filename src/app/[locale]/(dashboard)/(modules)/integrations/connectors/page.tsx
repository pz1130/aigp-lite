import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { ConnectorList } from "@/components/integrations/connectors/ConnectorList";

export default async function ConnectorsPage() {
  const t = await getTranslations("integrations");
  return (
    <>
      <PageHeader
        title={t("connector.title")}
        breadcrumb={
          <Link
            href="/integrations"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
      />
      <ConnectorList />
    </>
  );
}
