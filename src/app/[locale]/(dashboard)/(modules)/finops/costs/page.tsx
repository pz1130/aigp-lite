import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { CostDashboard } from "@/components/finops/CostDashboard";

export default async function CostsPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("finops.costs.title")}
        breadcrumb={
          <Link href="/finops" className="text-secondary hover:text-primary">
            {t("finops.title")}
          </Link>
        }
      />
      <CostDashboard />
    </>
  );
}
