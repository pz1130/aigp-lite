"use client";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { AttentionCard } from "./AttentionCard";
import { AlertTriangle, GitBranch, CheckCircle2 } from "lucide-react";

export function AttentionPanel() {
  const t = useTranslations("dashboard");
  const incidents = trpc.incident.list.useQuery({ status: "open" }).data ?? [];
  const approvals = trpc.workflow.list.useQuery().data ?? [];

  const hasAny = incidents.length + approvals.length > 0;
  if (!hasAny) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-subtle/40 px-4 py-3.5 shadow-sm">
        <CheckCircle2 size={16} className="text-success/80 shrink-0" />
        <span className="text-[13px] text-success font-medium">
          {t("attention.allClear")}
        </span>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3 px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary/60 italic">
          Needs attention
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-border-default/40 to-transparent" />
      </div>
      <div className="flex flex-wrap gap-3">
        {incidents.length > 0 && (
          <div className="flex-1 min-w-[200px]">
            <AttentionCard
              icon={AlertTriangle}
              tone="danger"
              count={incidents.length}
              title={t("attention.incidents.label")}
              bullets={incidents
                .slice(0, 2)
                .map((i) => `${i.title ?? i.id} · ${i.severity}`)}
              cta={{ label: t("attention.incidents.cta"), href: "/incidents" }}
            />
          </div>
        )}
        {approvals.length > 0 && (
          <div className="flex-1 min-w-[200px]">
            <AttentionCard
              icon={GitBranch}
              tone="info"
              count={approvals.length}
              title={t("attention.approvals.label")}
              bullets={approvals
                .slice(0, 2)
                .map((a) => a.usecase?.name ?? a.id)}
              cta={{ label: t("attention.approvals.cta"), href: "/workflow" }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
