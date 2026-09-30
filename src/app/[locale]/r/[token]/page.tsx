import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveUsecaseByToken } from "@/lib/external-reports/service";
import { signRenderedAt } from "@/lib/external-reports/anti-abuse";
import { PublicReportForm } from "@/components/external-reports/PublicReportForm";

export const runtime = "nodejs";

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const usecase = await resolveUsecaseByToken(token);
  if (!usecase) notFound();

  const t = await getTranslations("externalReports.public");
  const renderedAt = signRenderedAt(Date.now());

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("subtitle", { system: usecase.name })}
      </p>
      <PublicReportForm token={token} renderedAt={renderedAt} />
    </main>
  );
}
