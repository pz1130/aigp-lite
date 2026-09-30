import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { McpRiskBadge } from "@/components/mcp/McpRiskBadge";
import { McpStatusBadge } from "@/components/mcp/McpStatusBadge";
import { McpToolTable } from "@/components/mcp/McpToolTable";
import { McpInvocationLog } from "@/components/mcp/McpInvocationLog";
import { McpDriftBadge } from "@/components/mcp/McpDriftBadge";
import { McpDriftPanel } from "@/components/mcp/McpDriftPanel";
import { McpManualSnapshotForm } from "@/components/mcp/McpManualSnapshotForm";
import { McpSnapshotHistory } from "@/components/mcp/McpSnapshotHistory";

export default async function McpDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const server = await db.mcpServer.findFirst({
    where: { id },
    include: {
      tools: { orderBy: { name: "asc" } },
      invocations: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!server) notFound();

  return (
    <div>
      <PageHeader
        title={server.name}
        action={
          <Link href={`/mcp/${id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-sm font-medium text-secondary mb-2">Details</h2>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline text-secondary">Endpoint:</dt>{" "}
              <dd className="inline">{server.endpoint}</dd>
            </div>
            <div>
              <dt className="inline text-secondary">Transport:</dt>{" "}
              <dd className="inline">{server.transport}</dd>
            </div>
            <div>
              <dt className="inline text-secondary">Auth:</dt>{" "}
              <dd className="inline">{server.authType}</dd>
            </div>
            <div>
              <dt className="inline text-secondary">Risk:</dt>{" "}
              <dd className="inline">
                <McpRiskBadge tier={server.riskTier} />
              </dd>
            </div>
            <div>
              <dt className="inline text-secondary">Status:</dt>{" "}
              <dd className="inline flex items-center gap-2">
                <McpStatusBadge status={server.status} />
                <McpDriftBadge driftStatus={server.driftStatus} />
              </dd>
            </div>
            {server.owner && (
              <div>
                <dt className="inline text-secondary">Owner:</dt>{" "}
                <dd className="inline">{server.owner}</dd>
              </div>
            )}
            {server.notes && (
              <div>
                <dt className="inline text-secondary">Notes:</dt>{" "}
                <dd className="inline">{server.notes}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      <div className="mb-8">
        <McpDriftPanel serverId={id} />
      </div>
      <div className="mb-8">
        <h2 className="text-sm font-medium text-secondary mb-2">Tools</h2>
        <McpToolTable tools={server.tools} />
      </div>
      <div className="mb-8 space-y-6">
        <McpManualSnapshotForm serverId={id} />
        <McpSnapshotHistory serverId={id} />
      </div>
      <div>
        <h2 className="text-sm font-medium text-secondary mb-2">
          Recent Invocations
        </h2>
        <McpInvocationLog invocations={server.invocations} />
      </div>
    </div>
  );
}
