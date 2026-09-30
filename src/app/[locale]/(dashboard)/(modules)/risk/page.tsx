import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/routing";
import { PageHeader } from "@/components/page/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Crosshair, Plus } from "lucide-react";
import { hasPermission } from "@/lib/rbac/check";

const _severityToVariant = (
  level: string,
): "danger" | "warn" | "success" | "critical" => {
  if (level === "critical") return "critical";
  if (level === "high") return "danger";
  if (level === "medium") return "warn";
  return "success";
};

export default async function RiskPage() {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const t = await getTranslations("risk");
  const canWrite = hasPermission(ctx.role, "risk.write");
  const [frameworks, usecases] = await Promise.all([
    db.riskFramework.findMany({
      include: { controls: true },
      orderBy: { code: "asc" },
    }),
    db.aiUsecase.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={
          canWrite ? (
            <Link href="/risk/frameworks/new">
              <Button size="sm">
                <Plus size={14} className="mr-1" />
                {t("newFramework")}
              </Button>
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {frameworks.map((fw) => (
          <Link
            key={fw.id}
            href={`/risk/frameworks/${fw.code}`}
            title={fw.description || fw.name}
            className="group rounded-lg border border-border-default bg-surface p-4 transition-colors hover:bg-subtle"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield
                  size={16}
                  strokeWidth={1.5}
                  className="text-accent mt-0.5"
                />
                <span className="font-semibold text-primary">{fw.name}</span>
              </div>
              <Badge size="sm" variant="neutral">
                {fw.code}
              </Badge>
            </div>
            <p className="mt-2 text-small text-secondary">
              {fw.controls.length} {t("controls")}
            </p>
          </Link>
        ))}
      </div>
      {frameworks.length === 0 && (
        <p className="py-8 text-center text-secondary">{t("noFrameworks")}</p>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-secondary">
          {t("usecases")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {usecases.map((u) => (
            <Link
              key={u.id}
              href={`/risk/usecases/${u.id}`}
              className="group rounded-lg border border-border-default bg-surface p-4 transition-colors hover:bg-subtle"
            >
              <div className="flex items-center gap-2">
                <Crosshair
                  size={16}
                  strokeWidth={1.5}
                  className="text-accent"
                />
                <span className="font-semibold text-primary">{u.name}</span>
              </div>
              <p className="mt-1 text-small text-secondary">
                {t(`autonomy.${u.autonomyLevel}`)}
              </p>
            </Link>
          ))}
        </div>
        {usecases.length === 0 && (
          <p className="py-8 text-center text-secondary">{t("noUsecases")}</p>
        )}
      </div>
    </>
  );
}
