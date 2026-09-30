import { PolicyForm } from "@/components/policy/PolicyForm";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page";
import { Link } from "@/i18n/routing";

export default async function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("policy");
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const policy = await db.policy
    .findUnique({ where: { id } })
    .catch(() => null);
  if (!policy) notFound();
  return (
    <>
      <PageHeader
        title={`${t("edit")} — ${policy.name}`}
        breadcrumb={
          <Link href="/policy" className="text-accent hover:underline">
            ← {t("fields.name")}
          </Link>
        }
      />
      <PolicyForm mode="edit" policy={policy} />
    </>
  );
}
