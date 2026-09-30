import { PolicyForm } from "@/components/policy/PolicyForm";
import { SAMPLE_POLICIES } from "@/lib/policy-engine/samples";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/page";

export default async function NewPolicyPage() {
  const t = await getTranslations("policy");
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumb={
          <Link href="/policy" className="text-accent hover:underline">
            ← {t("fields.name")}
          </Link>
        }
      />
      <PolicyForm mode="create" samples={SAMPLE_POLICIES} />
    </>
  );
}
