import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { ReportsList } from "@/components/reports/ReportsList";

export default async function ReportsPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("reports.title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
      />
      <ReportsList />
    </>
  );
}
