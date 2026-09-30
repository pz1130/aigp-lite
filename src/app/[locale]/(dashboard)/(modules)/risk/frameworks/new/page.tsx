import { FrameworkForm } from "@/components/risk/FrameworkForm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { Link } from "@/i18n/routing";

export default async function NewFrameworkPage() {
  const t = await getTranslations("risk");
  return (
    <>
      <PageHeader
        title={t("newFramework")}
        breadcrumb={
          <Link href="/risk" className="text-accent hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <FrameworkForm />
    </>
  );
}
