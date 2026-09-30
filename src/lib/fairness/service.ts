import { prisma } from "@/lib/db";
import type { FairnessCheck, FairnessMetricKind } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";
import { canComplete, type AttributeLite } from "./rubric";

export class FairnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FairnessError";
  }
}

const withDetail = {
  attributes: { include: { subgroups: true }, orderBy: { createdAt: "asc" } },
} as const;

export interface AttributeInput {
  name: string;
  metric: FairnessMetricKind;
  subgroups: { label: string; value: number }[];
}

export function getAssessment(orgId: string, usecaseId: string) {
  return prisma.usecaseFairnessAssessment.findFirst({
    where: { orgId, usecaseId },
    include: withDetail,
  });
}

async function loadOwn(orgId: string, usecaseId: string) {
  const a = await getAssessment(orgId, usecaseId);
  if (!a) throw new FairnessError("Fairness assessment not found");
  return a;
}

export async function saveDraft(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  usecaseId: string;
  proxyReview: FairnessCheck | null;
  feedbackLoop: FairnessCheck | null;
  attributes: AttributeInput[];
  notes?: string | null;
}) {
  const {
    orgId,
    actorId,
    ip,
    usecaseId,
    proxyReview,
    feedbackLoop,
    attributes,
    notes,
  } = args;

  const usecase = await prisma.aiUsecase.findFirst({
    where: { id: usecaseId, orgId },
    select: { id: true },
  });
  if (!usecase) throw new FairnessError("Use case not found");

  const assessment = await prisma.$transaction(async (tx) => {
    const base = await tx.usecaseFairnessAssessment.upsert({
      where: { usecaseId },
      update: { proxyReview, feedbackLoop, notes: notes ?? null },
      create: {
        orgId,
        usecaseId,
        proxyReview,
        feedbackLoop,
        notes: notes ?? null,
      },
    });
    await tx.fairnessAttribute.deleteMany({ where: { assessmentId: base.id } });
    for (const attr of attributes) {
      await tx.fairnessAttribute.create({
        data: {
          assessmentId: base.id,
          name: attr.name,
          metric: attr.metric,
          subgroups: {
            create: attr.subgroups.map((s) => ({
              label: s.label,
              value: s.value,
            })),
          },
        },
      });
    }
    return base;
  });

  await writeAudit({
    orgId,
    actorId,
    action: "fairness.save",
    resourceType: "fairness",
    resourceId: assessment.id,
    after: { attributes: attributes.length, proxyReview, feedbackLoop },
    ip,
  });
  return loadOwn(orgId, usecaseId);
}

export async function completeAssessment(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  usecaseId: string;
}) {
  const { orgId, actorId, ip, usecaseId } = args;
  const a = await loadOwn(orgId, usecaseId);

  const attrLites: AttributeLite[] = a.attributes.map((at) => ({
    name: at.name,
    metric: at.metric,
    subgroups: at.subgroups.map((s) => ({ label: s.label, value: s.value })),
  }));
  if (
    !canComplete({
      attributes: attrLites,
      proxyReview: a.proxyReview,
      feedbackLoop: a.feedbackLoop,
    })
  ) {
    throw new FairnessError(
      "Cannot complete: need at least one attribute with two or more subgroups and both qualitative checks answered.",
    );
  }

  await prisma.usecaseFairnessAssessment.update({
    where: { id: a.id },
    data: {
      status: "completed",
      completedById: actorId,
      completedAt: new Date(),
    },
  });
  await writeAudit({
    orgId,
    actorId,
    action: "fairness.complete",
    resourceType: "fairness",
    resourceId: a.id,
    ip,
  });
  return loadOwn(orgId, usecaseId);
}

export async function reopenAssessment(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  usecaseId: string;
}) {
  const { orgId, actorId, ip, usecaseId } = args;
  const a = await loadOwn(orgId, usecaseId);
  await prisma.usecaseFairnessAssessment.update({
    where: { id: a.id },
    data: { status: "draft", completedById: null, completedAt: null },
  });
  await writeAudit({
    orgId,
    actorId,
    action: "fairness.reopen",
    resourceType: "fairness",
    resourceId: a.id,
    ip,
  });
  return loadOwn(orgId, usecaseId);
}
