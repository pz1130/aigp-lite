import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MyTasks } from "@/components/inventory/MyTasks";
import {
  ClipboardCheck,
  FileCheck2,
  FileText,
  ShieldCheck,
} from "lucide-react";

export default async function DashboardPage() {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("dashboard");

  const [usecases, evidence, approvals, audit] = await Promise.all([
    db.aiUsecase.count(),
    db.evidence.count(),
    db.workflowInstance.count({ where: { state: "open" } }),
    db.auditLog.count(),
  ]);

  const cards = [
    {
      href: "/inventory",
      label: t("overview.usecases"),
      value: usecases,
      icon: FileText,
    },
    {
      href: "/risk",
      label: t("overview.controls"),
      value: t("overview.reviewFrameworks"),
      icon: ShieldCheck,
    },
    {
      href: "/evidence",
      label: t("overview.evidence"),
      value: evidence,
      icon: FileCheck2,
    },
    {
      href: "/workflow",
      label: t("overview.pendingApprovals"),
      value: approvals,
      icon: ClipboardCheck,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/inventory/new">
            <Button>{t("overview.addUsecase")}</Button>
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ href, label, value, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full hover:border-accent/50">
              <CardBody className="space-y-3">
                <Icon size={18} className="text-accent" />
                <div>
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <p className="mt-1 text-2xl font-semibold text-primary">
                    {value}
                  </p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </section>

      <MyTasks session={ctx} />
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("overview.auditTitle")}</CardTitle>
            <p className="mt-1 text-sm text-secondary">
              {t("overview.auditDescription", { count: audit })}
            </p>
          </div>
          <Link href="/audit">
            <Button variant="secondary">{t("overview.viewAudit")}</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
