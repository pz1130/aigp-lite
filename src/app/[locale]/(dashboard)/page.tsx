import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page/PageHeader";
import { AttentionPanel } from "@/components/dashboard/AttentionPanel";
import { LiveKpiCard } from "@/components/dashboard/LiveKpiCard";
import { MaturityRadarCard } from "@/components/dashboard/MaturityRadarCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-semibold italic text-secondary/70 tracking-wide">
        {children}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-border-default/30 to-transparent" />
    </div>
  );
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      <AttentionPanel />

      {/* KPI Metrics */}
      <section>
        <SectionLabel>This week</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <LiveKpiCard kind="calls" />
          <LiveKpiCard kind="blocked" />
          <LiveKpiCard kind="spend" />
          <LiveKpiCard kind="maturity" />
        </div>
      </section>

      {/* Lower row */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <SectionLabel>Recent activity</SectionLabel>
          <ActivityFeed />
        </div>
        <div className="lg:col-span-3 space-y-3">
          <SectionLabel>Governance score</SectionLabel>
          <MaturityRadarCard />
        </div>
      </section>
    </div>
  );
}
