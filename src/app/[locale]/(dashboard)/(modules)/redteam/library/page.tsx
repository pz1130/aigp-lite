import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { LibraryBrowser } from "@/components/redteam/LibraryBrowser";

export default async function LibraryPage() {
  const t = await getTranslations("redteam");
  return (
    <>
      <PageHeader
        title={t("library.title", { defaultValue: "Prompt Library" })}
        breadcrumb={
          <Link href="/redteam" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <LibraryBrowser />
    </>
  );
}
