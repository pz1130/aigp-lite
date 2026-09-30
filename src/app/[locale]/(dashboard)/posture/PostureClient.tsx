"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PostureSummary } from "@/components/governance/PostureSummary";
import { PostureTable } from "@/components/governance/PostureTable";
import { ReadinessRollupClient } from "@/components/governance/ReadinessRollupClient";

function HealthScoreTab() {
  const { data, isLoading } = trpc.governance.posture.useQuery();
  const t = useTranslations("posture.readiness");

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <PostureSummary data={data} />
      {data.usecases.length > 0 && <PostureTable data={data} />}
    </div>
  );
}

export function PostureClient() {
  const t = useTranslations("posture.readiness");
  return (
    <Tabs defaultValue="health">
      <TabsList>
        <TabsTrigger value="health">{t("tabHealth")}</TabsTrigger>
        <TabsTrigger value="readiness">{t("tabReadiness")}</TabsTrigger>
      </TabsList>
      <TabsContent value="health">
        <HealthScoreTab />
      </TabsContent>
      <TabsContent value="readiness">
        <ReadinessRollupClient />
      </TabsContent>
    </Tabs>
  );
}
