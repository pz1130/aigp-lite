"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/format/duration";

const SEVERITY_BADGE_VARIANT = {
  low: "success",
  medium: "warn",
  high: "warn",
  critical: "danger",
} as const;

const STATUS_BADGE_VARIANT = {
  open: "danger",
  investigating: "warn",
  mitigated: "info",
  closed: "neutral",
} as const;

const CATEGORY_BADGE_VARIANT = {
  hijack: "danger",
  capability_breach: "danger",
  data_leak: "danger",
  trust_failure: "warn",
  cascade: "warn",
  audit_failure: "warn",
  resource_abuse: "info",
  bias_harm: "warn",
  policy_bypass: "info",
} as const;

const SEVERITY_PCODE = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
} as const;

type SlaKind = "overdue" | "imminent" | "ok";

export function slaState(
  deadline: Date | null,
  status: IncidentRow["status"],
  now = Date.now(),
): { kind: SlaKind; label: string } | null {
  if (!deadline) return null;
  if (status === "mitigated" || status === "closed") return null;
  const ms = deadline.getTime() - now;
  if (ms < 0) return { kind: "overdue", label: formatDuration(-ms) };
  if (ms < 3_600_000) return { kind: "imminent", label: formatDuration(ms) };
  return { kind: "ok", label: formatDuration(ms) };
}

export function IncidentsTable({ incidents }: { incidents: IncidentRow[] }) {
  const t = useTranslations("incident");

  return (
    <div className="space-y-3">
      {incidents.map((inc) => {
        const sla = slaState(inc.slaDeadline, inc.status);
        return (
          <Card key={inc.id}>
            <CardBody className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {inc.autoCreatedFromPolicyEvalId && (
                    <span
                      title={t("list.autoCreatedTooltip")}
                      className="shrink-0"
                    >
                      🤖
                    </span>
                  )}
                  <Link
                    href={`/incidents/${inc.id}`}
                    className="font-semibold hover:underline"
                  >
                    {inc.title}
                  </Link>
                </div>
                {inc.rootCause && (
                  <p className="mt-1 text-sm text-secondary">
                    {inc.rootCause.slice(0, 80)}
                    {inc.rootCause.length > 80 ? "…" : ""}
                  </p>
                )}
                {inc.usecase && (
                  <p className="mt-1 text-xs text-tertiary">
                    {t("form.relatedUsecase")}: {inc.usecase.name}
                  </p>
                )}
                <p className="mt-2 text-xs text-secondary">
                  {t("status.open")}: {new Date(inc.openedAt).toLocaleString()}
                  {inc.closedAt
                    ? ` → ${t("status.closed")}: ${new Date(inc.closedAt).toLocaleString()}`
                    : ""}
                  {sla && (
                    <span
                      className={`ml-3 ${
                        sla.kind === "overdue"
                          ? "text-red-500 font-medium"
                          : sla.kind === "imminent"
                            ? "text-amber-500 font-medium"
                            : "text-tertiary"
                      }`}
                    >
                      {sla.kind === "overdue"
                        ? t("sla.overdueBy")
                        : t("sla.dueIn")}{" "}
                      {sla.label}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={SEVERITY_BADGE_VARIANT[inc.severity]} size="sm">
                  {SEVERITY_PCODE[inc.severity]} ·{" "}
                  {t(`severity.${inc.severity}`)}
                </Badge>
                <Badge variant={STATUS_BADGE_VARIANT[inc.status]} size="sm">
                  {t(`status.${inc.status}`)}
                </Badge>
                {inc.category && (
                  <Badge
                    variant={CATEGORY_BADGE_VARIANT[inc.category]}
                    size="sm"
                  >
                    {t(`category.${inc.category}`)}
                  </Badge>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

export interface IncidentRow {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "mitigated" | "closed";
  category:
    | "hijack"
    | "capability_breach"
    | "data_leak"
    | "trust_failure"
    | "cascade"
    | "audit_failure"
    | "resource_abuse"
    | "bias_harm"
    | "policy_bypass"
    | null;
  slaDeadline: Date | null;
  rootCause: string | null;
  openedAt: Date;
  closedAt: Date | null;
  openedBy: { name: string };
  closedBy: { name: string } | null;
  usecase: { name: string } | null;
  mergedIntoId: string | null;
  autoCreatedFromPolicyEvalId: string | null;
}
