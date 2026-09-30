import Link from "next/link";
import { Playground } from "@/components/policy/Playground";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page";

export default async function PlaygroundPage() {
  const t = await getTranslations("policy");
  return (
    <>
      <PageHeader
        title={t("playground")}
        breadcrumb={
          <Link href="/policy" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <Playground />
    </>
  );
}
