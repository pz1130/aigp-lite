import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page";
import { hasPermission } from "@/lib/rbac/check";
import { IncidentRcaPanel } from "./IncidentRcaPanel";
import { MergeSuggestionBanner } from "./MergeSuggestionBanner";
import { MergedIntoBanner } from "./MergedIntoBanner";
import { AutoOpenSourceMetadata } from "./AutoOpenSourceMetadata";

export default async function IncidentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);

  const incident = await db.incident.findFirst({
    where: { id },
    include: {
      openedBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      usecase: { select: { id: true, name: true } },
    },
  });
  if (!incident) notFound();

  const canWrite =
    hasPermission(ctx.role, "incident.write") && !incident.mergedIntoId;

  return (
    <>
      <PageHeader
        title={incident.title}
        breadcrumb={
          <Link href="/incidents" className="text-secondary hover:text-primary">
            Incidents
          </Link>
        }
      />

      <MergeSuggestionBanner incidentId={incident.id} />
      {incident.mergedIntoId ? (
        <MergedIntoBanner targetId={incident.mergedIntoId} />
      ) : null}

      <section className="space-y-2 mb-4">
        <div className="text-sm">
          Severity: <strong>{incident.severity}</strong> · Status:{" "}
          <strong>{incident.status}</strong>
        </div>
        {incident.category && (
          <div className="text-sm">Category: {incident.category}</div>
        )}
        {incident.usecase && (
          <div className="text-sm">Usecase: {incident.usecase.name}</div>
        )}
        <div className="text-xs text-tertiary">
          Opened {incident.openedAt.toISOString()}
        </div>
        {incident.autoCreatedFromPolicyEvalId ? (
          <AutoOpenSourceMetadata
            evaluationId={incident.autoCreatedFromPolicyEvalId}
            openedAt={incident.openedAt}
          />
        ) : null}
      </section>

      <section className="mb-4">
        <h2 className="font-medium">Root cause</h2>
        <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">
          {incident.rootCause || "(no root cause yet)"}
        </pre>
      </section>

      <IncidentRcaPanel incidentId={incident.id} canWrite={canWrite} />
    </>
  );
}
