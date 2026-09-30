import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page/PageHeader";
import { PostureClient } from "./PostureClient";
import { getTranslations } from "next-intl/server";

export default async function PosturePage() {
  await requireSession();
  const t = await getTranslations("posture");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <PostureClient />
    </>
  );
}
