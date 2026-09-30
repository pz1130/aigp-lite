import { getUserOrganizations, requireSession } from "@/lib/auth/session";
import { redirect } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";

export default async function SelectOrgPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const ctx = await requireSession();
  const { locale } = await params;
  const organizations = await getUserOrganizations(ctx.userId);
  if (organizations.length <= 1) {
    redirect({ href: "/", locale: locale as "zh" | "en" });
  }
  const t = await getTranslations("auth.selectOrg");

  return (
    <div className="space-y-5">
      <header className="space-y-1 text-center">
        <h1 className="text-xl font-semibold text-white">{t("title")}</h1>
        <p className="text-sm text-white/60">{t("subtitle")}</p>
      </header>
      <OrganizationSwitcher
        organizations={organizations}
        activeOrgId={ctx.orgId}
        redirectAfterSwitch
      />
    </div>
  );
}
