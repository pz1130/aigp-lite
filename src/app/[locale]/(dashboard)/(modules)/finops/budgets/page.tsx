import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { BudgetList } from "@/components/finops/BudgetList";

export default async function BudgetsPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("finops.budget.title")}
        breadcrumb={
          <Link href="/finops" className="text-secondary hover:text-primary">
            {t("finops.title")}
          </Link>
        }
      />
      <BudgetList />
    </>
  );
}
