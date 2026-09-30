import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import { DriftScoreBadge } from "@/components/drift/DriftScoreBadge";

export default async function DriftRunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string; locale: string }>;
}) {
  const { id: _id, runId } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const run = await db.driftRun.findFirst({
    where: { id: runId, orgId: ctx.orgId },
    include: {
      results: {
        include: {
          prompt: {
            select: {
              promptText: true,
              expectedBehavior: true,
              sortOrder: true,
            },
          },
        },
        orderBy: { prompt: { sortOrder: "asc" } },
      },
      benchmark: { select: { name: true, threshold: true } },
    },
  });
  if (!run) notFound();

  return (
    <div>
      <PageHeader title={`Run — ${run.benchmark.name}`} />
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">Status</div>
          <div className="text-sm font-medium">{run.status}</div>
        </div>
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">Avg Score</div>
          <div>
            {run.avgScore != null ? (
              <DriftScoreBadge
                score={run.avgScore}
                threshold={run.benchmark.threshold}
              />
            ) : (
              <span className="text-sm text-tertiary">—</span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">Target</div>
          <div className="text-sm">
            {run.targetProvider}/{run.targetModel}
          </div>
        </div>
        <div className="rounded-md border border-muted p-3">
          <div className="text-xs text-tertiary mb-1">Degraded</div>
          <div className="text-sm">{run.degraded ? "Yes" : "No"}</div>
        </div>
      </div>

      <h3 className="text-sm font-medium text-secondary mb-2">
        Per-Prompt Results
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default text-left text-secondary">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Prompt</th>
              <th className="py-2 pr-4">Expected</th>
              <th className="py-2 pr-4">Score</th>
              <th className="py-2 pr-4">Judgment</th>
              <th className="py-2">Latency</th>
            </tr>
          </thead>
          <tbody>
            {run.results.map((r) => (
              <tr key={r.id} className="border-b border-border-default">
                <td className="py-2 pr-4 text-secondary">
                  {r.prompt.sortOrder + 1}
                </td>
                <td className="py-2 pr-4 max-w-xs truncate">
                  {r.prompt.promptText}
                </td>
                <td className="py-2 pr-4 max-w-xs truncate">
                  {r.prompt.expectedBehavior}
                </td>
                <td className="py-2 pr-4">
                  <DriftScoreBadge
                    score={r.score}
                    threshold={run.benchmark.threshold}
                  />
                </td>
                <td className="py-2 pr-4 max-w-sm truncate">{r.judgment}</td>
                <td className="py-2">
                  {r.targetLatencyMs != null ? `${r.targetLatencyMs}ms` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
