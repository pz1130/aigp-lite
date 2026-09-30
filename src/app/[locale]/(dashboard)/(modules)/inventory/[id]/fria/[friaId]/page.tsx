import { requireSession } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page/PageHeader";
import { FriaDetailClient } from "@/components/fria/FriaDetailClient";
import type { FriaSections } from "@/lib/fria/sections-schema";

export default async function FriaDetailPage({
  params,
}: {
  params: Promise<{ id: string; friaId: string; locale: string }>;
}) {
  const { id, friaId } = await params;
  const ctx = await requireSession();
  const db = withOrg(prisma, ctx.orgId);
  const fria = await db.usecaseFria.findUnique({
    where: { id: friaId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!fria || fria.usecaseId !== id) notFound();
  return (
    <>
      <PageHeader title={fria.title} />
      <FriaDetailClient
        friaId={fria.id}
        status={fria.status}
        userRole={ctx.role}
        isCreator={fria.createdById === ctx.userId}
        initialSections={fria.sectionsJson as unknown as FriaSections}
      />
    </>
  );
}
