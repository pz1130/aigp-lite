import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { AutomationForm } from "./AutomationForm";

export default async function Page() {
  const ctx = await getSessionContext();
  if (!ctx || ctx.role !== "admin") redirect({ href: "/", locale: "en" });

  const t = await getTranslations("incident.automation");
  return (
    <div className="space-y-4 p-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-primary">
          {t("settings_title")}
        </h1>
        <p className="text-sm text-secondary mt-1">{t("settings_subtitle")}</p>
      </div>
      <AutomationForm />
    </div>
  );
}
