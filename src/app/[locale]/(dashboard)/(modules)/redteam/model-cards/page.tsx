import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { ModelCardGenerate } from "@/components/redteam/ModelCardGenerate";

export default async function ModelCardsPage() {
  const t = await getTranslations("redteam");
  return (
    <>
      <PageHeader
        title={t("modelCard.title", { defaultValue: "Model Card Generation" })}
        breadcrumb={
          <Link href="/redteam" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <ModelCardGenerate />
    </>
  );
}
