import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { RunsList } from "@/components/redteam/RunsList";

export default async function RunsPage() {
  const t = await getTranslations("redteam");
  return (
    <>
      <PageHeader
        title={t("runs.title")}
        breadcrumb={
          <Link href="/redteam" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <RunsList />
    </>
  );
}
