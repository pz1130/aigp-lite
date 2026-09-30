import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { PricingView } from "@/components/finops/PricingView";

export default async function PricingPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("finops.pricing.title")}
        breadcrumb={
          <Link href="/finops" className="text-secondary hover:text-primary">
            {t("finops.title")}
          </Link>
        }
      />
      <PricingView />
    </>
  );
}
