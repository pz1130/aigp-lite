import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { FrameworkForm } from "@/components/risk/FrameworkForm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { Link } from "@/i18n/routing";

export default async function NewFrameworkPage() {
  const ctx = await requireSession();
  if (!hasPermission(ctx.role, "risk-catalog.write")) notFound();
  const t = await getTranslations("risk");
  return (
    <>
      <PageHeader
        title={t("newFramework")}
        breadcrumb={
          <Link href="/risk" className="text-accent hover:text-primary">
            {t("title")}
          </Link>
        }
      />
      <FrameworkForm />
    </>
  );
}
