"use client";
import { useTranslations, useLocale } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { formatRelative } from "@/lib/format/intl";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/_utils/cn";

const TAG_COLORS: Record<string, string> = {
  CREATE: "bg-success/10 text-success border border-success/20",
  UPDATE: "bg-warn/10 text-warn border border-warn/20",
  DELETE: "bg-danger/10 text-danger border border-danger/20",
  READ: "bg-muted text-tertiary border border-transparent",
};

function actionTag(action: string) {
  const key = (action.split(":")[0] ?? action).toUpperCase();
  return { key, color: TAG_COLORS[key] ?? TAG_COLORS.READ };
}

export function ActivityFeed() {
  const _t = useTranslations("dashboard");
  const locale = useLocale();
  const q = trpc.audit.list.useQuery({ limit: 10 });
  const rows = q.data ?? [];

  return (
    <Card className="overflow-hidden">
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon="activity"
            title="No activity yet"
            description="Actions from your team will appear here as they work."
          />
        ) : (
          <div className="divide-y divide-border-default/40">
            {rows.map((r) => {
              const { key, color } = actionTag(r.action);
              const detail = r.action?.includes(":")
                ? r.action.split(":")[1]?.trim()
                : "";
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-default group"
                >
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                      color,
                    )}
                  >
                    {key}
                  </span>
                  <span className="flex-1 text-[12px] text-secondary/80 leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                    {detail || r.action}
                  </span>
                  <span
                    className="shrink-0 text-[11px] text-tertiary/60 font-mono"
                    suppressHydrationWarning
                  >
                    {formatRelative(new Date(r.ts), locale)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
