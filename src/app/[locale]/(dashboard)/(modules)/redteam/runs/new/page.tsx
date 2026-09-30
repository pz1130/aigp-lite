import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { RunWizard } from "@/components/redteam/RunWizard";

export default async function NewRunPage() {
  const t = await getTranslations("redteam");
  return (
    <>
      <PageHeader
        title={t("run.new")}
        breadcrumb={
          <Link href="/redteam" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <RunWizard />
    </>
  );
}
