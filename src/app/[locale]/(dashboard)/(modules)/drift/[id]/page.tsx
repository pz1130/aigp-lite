import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DriftScoreBadge } from "@/components/drift/DriftScoreBadge";

export default async function DriftDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const benchmark = await db.driftBenchmark.findFirst({
    where: { id },
    include: {
      prompts: { orderBy: { sortOrder: "asc" } },
      runs: { orderBy: { startedAt: "desc" }, take: 10 },
    },
  });
  if (!benchmark) notFound();

  return (
    <div>
      <PageHeader
        title={benchmark.name}
        action={
          <Link href={`/drift/${id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-sm font-medium text-secondary mb-2">Details</h2>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline text-secondary">Threshold:</dt>{" "}
              <dd className="inline">{benchmark.threshold}</dd>
            </div>
            {benchmark.description && (
              <div>
                <dt className="inline text-secondary">Description:</dt>{" "}
                <dd className="inline">{benchmark.description}</dd>
              </div>
            )}
            <div>
              <dt className="inline text-secondary">Prompts:</dt>{" "}
              <dd className="inline">{benchmark.prompts.length}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-medium text-secondary mb-2">Prompts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-secondary">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Prompt</th>
                <th className="py-2">Expected Behavior</th>
              </tr>
            </thead>
            <tbody>
              {benchmark.prompts.map(
                (p: {
                  id: string;
                  sortOrder: number;
                  promptText: string;
                  expectedBehavior: string;
                }) => (
                  <tr key={p.id} className="border-b border-border-default">
                    <td className="py-2 pr-4 text-secondary">
                      {p.sortOrder + 1}
                    </td>
                    <td className="py-2 pr-4 max-w-md truncate">
                      {p.promptText}
                    </td>
                    <td className="py-2">{p.expectedBehavior}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-secondary mb-2">Recent Runs</h2>
        {benchmark.runs.length === 0 ? (
          <p className="text-sm text-tertiary">No runs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-secondary">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Degraded</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {benchmark.runs.map(
                  (r: {
                    id: string;
                    status: string;
                    avgScore: number | null;
                    degraded: boolean;
                    targetProvider: string;
                    targetModel: string;
                    startedAt: Date;
                  }) => (
                    <tr
                      key={r.id}
                      className="border-b border-border-default hover:bg-subtle/30"
                    >
                      <td className="py-2 pr-4">
                        <Link
                          href={`/drift/${id}/run/${r.id}`}
                          className="text-primary hover:underline"
                        >
                          {r.status}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {r.avgScore != null ? (
                          <DriftScoreBadge
                            score={r.avgScore}
                            threshold={benchmark.threshold}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4">{r.degraded ? "Yes" : "No"}</td>
                      <td className="py-2 pr-4 text-secondary">
                        {r.targetProvider}/{r.targetModel}
                      </td>
                      <td className="py-2">
                        {new Date(r.startedAt).toLocaleString()}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
