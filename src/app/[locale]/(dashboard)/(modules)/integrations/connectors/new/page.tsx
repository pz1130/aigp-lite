import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { ConnectorWizard } from "@/components/integrations/connectors/ConnectorWizard";

export default async function NewConnectorPage() {
  const t = await getTranslations("integrations");
  return (
    <>
      <PageHeader
        title={t("connector.new")}
        breadcrumb={
          <Link
            href="/integrations"
            className="text-secondary hover:text-primary"
          >
            {t("title")}
          </Link>
        }
      />
      <ConnectorWizard />
    </>
  );
}
