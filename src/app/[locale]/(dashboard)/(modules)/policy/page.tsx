import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/prisma";
import { SAMPLE_POLICIES } from "@/lib/policy-engine/samples";
import { loadEffectivePolicies } from "@/lib/policy/effective";
import { PageHeader } from "@/components/page";
import { PolicyPageShell } from "@/components/policy/PolicyGuide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

export default async function PolicyPage() {
  const t = await getTranslations("policy");
  const ctx = await requireSession();
  const { own: policies, inherited } = await loadEffectivePolicies(ctx.orgId);
  const isEmpty = policies.length === 0;

  return (
    <>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Link href="/" className="text-secondary hover:text-primary">
            Dashboard
          </Link>
        }
        action={
          <div className="flex gap-2">
            {isEmpty && (
              <form
                action={async () => {
                  "use server";
                  const c = await requireSession();
                  const db = withOrg(prisma, c.orgId);
                  for (const p of SAMPLE_POLICIES) {
                    await db.policy.create({
                      data: {
                        orgId: c.orgId,
                        name: p.name,
                        description: "",
                        ruleJson: p.ruleJson as Prisma.InputJsonValue,
                        enforcementMode: p.enforcementMode,
                        scope: p.scope,
                        severity: p.severity,
                        enabled: true,
                      },
                    });
                  }
                }}
              >
                <Button variant="secondary" size="sm">
                  {t("installSamples")}
                </Button>
              </form>
            )}
            <Link href="/policy/new">
              <Button size="sm">+ {t("new")}</Button>
            </Link>
            <Link href="/policy/api-keys">
              <Button variant="secondary" size="sm">
                {t("apiKeys")}
              </Button>
            </Link>
            <Link href="/policy/playground">
              <Button variant="secondary" size="sm">
                {t("playground")}
              </Button>
            </Link>
            <Link href="/policy/evaluations">
              <Button variant="secondary" size="sm">
                {t("evaluations")}
              </Button>
            </Link>
          </div>
        }
      />

      <PolicyPageShell>
        {isEmpty ? (
          <p className="text-secondary">{t("noPolicies")}</p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{t("fields.name")}</Th>
                <Th>{t("fields.severity")}</Th>
                <Th>{t("fields.mode")}</Th>
                <Th>{t("fields.scope")}</Th>
                <Th>{t("fields.enabled")}</Th>
              </Tr>
            </THead>
            <TBody>
              {policies.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link
                      href={`/policy/${p.id}/edit`}
                      className="text-accent hover:underline"
                    >
                      {p.name}
                    </Link>
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        p.severity === "high"
                          ? "danger"
                          : p.severity === "medium"
                            ? "warn"
                            : "success"
                      }
                      size="sm"
                    >
                      {t(`severity.${p.severity}`)}
                    </Badge>
                  </Td>
                  <Td>{t(`mode.${p.enforcementMode}`)}</Td>
                  <Td>{t(`scope.${p.scope}`)}</Td>
                  <Td>{p.enabled ? "Yes" : "No"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </PolicyPageShell>

      {inherited.length > 0 && (
        <PolicyPageShell>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-primary">
              {t("inheritedPolicies")}
            </h2>
            <Badge variant="neutral" size="sm">
              {t("inheritedFromHq")}
            </Badge>
          </div>
          <p className="mb-3 text-xs text-secondary">
            {t("inheritedReadonly")}
          </p>
          <Table>
            <THead>
              <Tr>
                <Th>{t("fields.name")}</Th>
                <Th>{t("fields.severity")}</Th>
                <Th>{t("fields.mode")}</Th>
                <Th>{t("fields.scope")}</Th>
                <Th>{t("fields.enabled")}</Th>
              </Tr>
            </THead>
            <TBody>
              {inherited.map((p) => (
                <Tr key={p.id}>
                  <Td>{p.name}</Td>
                  <Td>
                    <Badge
                      variant={
                        p.severity === "high"
                          ? "danger"
                          : p.severity === "medium"
                            ? "warn"
                            : "success"
                      }
                      size="sm"
                    >
                      {t(`severity.${p.severity}`)}
                    </Badge>
                  </Td>
                  <Td>{t(`mode.${p.enforcementMode}`)}</Td>
                  <Td>{t(`scope.${p.scope}`)}</Td>
                  <Td>{p.enabled ? "Yes" : "No"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </PolicyPageShell>
      )}
    </>
  );
}
