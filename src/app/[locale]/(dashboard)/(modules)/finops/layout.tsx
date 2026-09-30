import { getTranslations } from "next-intl/server";
import { FinopsNav } from "@/components/finops/FinopsNav";

export default async function FinopsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("finops");
  return (
    <div className="space-y-4">
      <FinopsNav
        labels={{
          costs: t("costs.title"),
          budgets: t("budget.title"),
          pricing: t("pricing.title"),
          providers: t("pricing.configureProviders"),
        }}
      />
      {children}
    </div>
  );
}
