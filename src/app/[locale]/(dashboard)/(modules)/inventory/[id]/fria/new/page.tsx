import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { FriaNewClient } from "@/components/fria/FriaNewClient";
import { getTranslations } from "next-intl/server";

export default async function NewFriaPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  await requireSession();
  const t = await getTranslations("fria");
  return (
    <>
      <PageHeader title={t("title")} />
      <FriaNewClient usecaseId={id} />
    </>
  );
}
