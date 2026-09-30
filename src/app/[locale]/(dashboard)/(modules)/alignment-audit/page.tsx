import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { ListClient } from "@/components/alignment-audit/ListClient";

export default async function AlignmentAuditListPage() {
  await requireSession();
  const t = await getTranslations("alignmentAudit");
  return (
    <div>
      <PageHeader
        title={t("title")}
        action={
          <Link href="/alignment-audit/new">
            <Button>{t("newAudit")}</Button>
          </Link>
        }
      />
      <ListClient />
    </div>
  );
}
