import { UsecaseForm } from "@/components/inventory/UsecaseForm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { Link } from "@/i18n/routing";

export default async function NewUsecasePage() {
  const t = await getTranslations("inventory");
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumb={
          <Link href="/inventory" className="text-accent hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <UsecaseForm />
    </>
  );
}
