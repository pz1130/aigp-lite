import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/page";

export default async function EvaluationsPage() {
  const t = await getTranslations("policy");
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const hits = await db.policyEvaluation.findMany({
    where: { hit: true },
    orderBy: { ts: "desc" },
    take: 50,
    include: { policy: true },
  });

  const csvRows: string[][] = [
    ["Timestamp", "Policy", "Scope", "Mode", "Snippet"],
    ...hits.map((h) => [
      h.ts.toISOString(),
      h.policy.name,
      h.policy.scope,
      h.policy.enforcementMode,
      h.snippet,
    ]),
  ];
  const csv = csvRows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return (
    <>
      <PageHeader
        title={t("recentEvals")}
        breadcrumb={
          <Link href="/policy" className="text-secondary hover:text-primary">
            {t("title")}
          </Link>
        }
        action={
          hits.length > 0 ? (
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
              download="policy_evaluations.csv"
            >
              <Button variant="secondary" size="sm">
                {t("exportCsv")}
              </Button>
            </a>
          ) : undefined
        }
      />
      {hits.length === 0 ? (
        <EmptyState icon={Inbox} title={t("noHits")} />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Time</Th>
              <Th>Policy</Th>
              <Th>Scope</Th>
              <Th>Mode</Th>
              <Th>Snippet</Th>
            </Tr>
          </THead>
          <TBody>
            {hits.map((h) => (
              <Tr key={h.id}>
                <Td className="text-secondary">{h.ts.toLocaleString()}</Td>
                <Td className="font-medium">{h.policy.name}</Td>
                <Td>
                  <Badge
                    variant={h.policy.scope === "input" ? "info" : "neutral"}
                    size="sm"
                  >
                    {h.policy.scope}
                  </Badge>
                </Td>
                <Td>
                  <Badge
                    variant={
                      h.policy.enforcementMode === "block"
                        ? "danger"
                        : h.policy.enforcementMode === "warn"
                          ? "warn"
                          : "neutral"
                    }
                    size="sm"
                  >
                    {h.policy.enforcementMode}
                  </Badge>
                </Td>
                <Td className="font-mono text-xs text-secondary max-w-xs truncate">
                  {h.snippet}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
