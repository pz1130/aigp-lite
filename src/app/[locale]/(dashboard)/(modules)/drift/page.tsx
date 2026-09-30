import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { PageHeader } from "@/components/page/PageHeader";
import { EmptyState } from "@/components/page/EmptyState";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";

export default async function DriftListPage() {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const benchmarks = await db.driftBenchmark.findMany({
    include: {
      _count: { select: { prompts: true, runs: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Drift Monitoring"
        action={
          <Link href="/drift/new">
            <Button>New Benchmark</Button>
          </Link>
        }
      />
      {benchmarks.length === 0 ? (
        <EmptyState icon={Activity} title="No benchmarks defined" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-secondary">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Threshold</th>
                <th className="py-2 pr-4">Prompts</th>
                <th className="py-2 pr-4">Runs</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map(
                (b: {
                  id: string;
                  name: string;
                  threshold: number;
                  _count: { prompts: number; runs: number };
                  createdAt: Date;
                }) => (
                  <tr
                    key={b.id}
                    className="border-b border-border-default hover:bg-subtle/30"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/drift/${b.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {b.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{b.threshold}</td>
                    <td className="py-2 pr-4">{b._count.prompts}</td>
                    <td className="py-2 pr-4">{b._count.runs}</td>
                    <td className="py-2">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
