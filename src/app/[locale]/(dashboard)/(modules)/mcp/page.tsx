import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { PageHeader } from "@/components/page/PageHeader";
import Link from "next/link";
import { McpRiskBadge } from "@/components/mcp/McpRiskBadge";
import { McpStatusBadge } from "@/components/mcp/McpStatusBadge";
import { McpDriftBadge } from "@/components/mcp/McpDriftBadge";
import { Button } from "@/components/ui/button";
import { AgentTestingHint } from "@/components/governance/AgentTestingHint";

export default async function McpListPage() {
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const servers = await db.mcpServer.findMany({
    where: { status: { not: "archived" } },
    include: { _count: { select: { tools: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="MCP Servers"
        action={
          <Link href="/mcp/new">
            <Button>Add Server</Button>
          </Link>
        }
      />
      {servers.length === 0 ? (
        <AgentTestingHint layer="hands" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-secondary">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Endpoint</th>
                <th className="py-2 pr-4">Transport</th>
                <th className="py-2 pr-4">Risk</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Tools</th>
              </tr>
            </thead>
            <tbody>
              {servers.map(
                (s: {
                  id: string;
                  name: string;
                  endpoint: string;
                  transport: string;
                  riskTier: string;
                  status: string;
                  driftStatus: string;
                  _count: { tools: number };
                }) => (
                  <tr
                    key={s.id}
                    className="border-b border-border-default hover:bg-subtle/30"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/mcp/${s.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-secondary truncate max-w-xs">
                      {s.endpoint}
                    </td>
                    <td className="py-2 pr-4">{s.transport}</td>
                    <td className="py-2 pr-4">
                      <McpRiskBadge tier={s.riskTier} />
                    </td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <McpStatusBadge status={s.status} />
                        <McpDriftBadge driftStatus={s.driftStatus} />
                      </span>
                    </td>
                    <td className="py-2">{s._count.tools}</td>
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
