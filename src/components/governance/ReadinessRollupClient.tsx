"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { trpc } from "@/lib/trpc/client";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import type { GoLiveState } from "@/lib/dossier/types";

const STATE_KEYS: GoLiveState[] = [
  "ready",
  "conditionally_ready",
  "not_ready",
  "needs_re_review",
  "live",
];

export function ReadinessRollupClient() {
  const t = useTranslations("posture.readiness");
  const td = useTranslations("dossier");
  const { data, isLoading } = trpc.dossier.rollup.useQuery();

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATE_KEYS.map((k) => (
          <div key={k} className="rounded-lg border bg-surface p-4">
            <p className="text-2xl font-bold tabular-nums">{data.counts[k]}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {td(`state.${k}`)}
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="text-2xl font-bold tabular-nums text-red-600">
            {data.counts.highRiskBlocked}
          </p>
          <p className="text-xs text-red-700 mt-1">{t("highRiskBlocked")}</p>
        </div>
      </div>

      {data.blocked.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t("colSystem")}</Th>
              <Th>{t("colOwner")}</Th>
              <Th>{t("colHighRisk")}</Th>
              <Th>{t("colBlockingChecks")}</Th>
            </Tr>
          </THead>
          <TBody>
            {data.blocked.map((row) => (
              <Tr key={row.usecaseId}>
                <Td>
                  <Link
                    href={`/inventory/${row.usecaseId}`}
                    className="text-accent hover:underline"
                  >
                    {row.name}
                  </Link>
                </Td>
                <Td>{row.ownerName ?? t("noOwner")}</Td>
                <Td>
                  {row.isHighRisk && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {t("highRiskBadge")}
                    </span>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {row.blockingCheckIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-secondary"
                      >
                        {td(`checks.${id}.label`)}
                      </span>
                    ))}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
