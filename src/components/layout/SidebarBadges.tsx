"use client";
import { trpc } from "@/lib/trpc/client";

export function BadgeFor({ slug }: { slug: string }) {
  const q =
    slug === "workflow"
      ? (trpc.workflow.pendingCount?.useQuery?.()?.data ?? 0)
      : slug === "risk"
        ? (trpc.risk.highRiskCount?.useQuery?.()?.data ?? 0)
        : slug === "incidents"
          ? (trpc.incident.openCount?.useQuery?.()?.data ?? 0)
          : 0;

  if (q === 0) return null;

  const colors =
    {
      workflow: "bg-accent/15 text-accent",
      risk: "bg-danger/15 text-danger",
      incidents: "bg-warn/15 text-warn",
    }[slug] ?? "bg-muted text-tertiary";

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-semibold rounded-full ${colors}`}
    >
      {q > 99 ? "99+" : q}
    </span>
  );
}
