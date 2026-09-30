import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/page/PageHeader";
import { AuditSinkList } from "@/components/audit/AuditSinkList";

export default async function AuditSinksPage() {
  const t = await getTranslations("audit");
  return (
    <>
      <PageHeader
        title={t("sinks.title")}
        breadcrumb={
          <Link href="/audit" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <AuditSinkList />
    </>
  );
}
