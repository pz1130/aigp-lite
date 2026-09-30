import { prisma } from "@/lib/db";
import type { MfChecklistAssessment } from "@/lib/prisma";
import { getCatalog, flattenItems } from "./catalog";
import type { CheckStatusInput } from "./answer-schema";

export class MfChecklistStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MfChecklistStateError";
  }
}

async function loadOwn(
  orgId: string,
  id: string,
): Promise<MfChecklistAssessment> {
  const row = await prisma.mfChecklistAssessment.findFirst({
    where: { id, orgId },
  });
  if (!row)
    throw new MfChecklistStateError(
      `MindForge checklist assessment ${id} not found in org ${orgId}`,
    );
  return row;
}

export async function createAssessment(args: {
  orgId: string;
  userId: string;
  usecaseId?: string | null;
  title: string;
}): Promise<MfChecklistAssessment> {
  const usecaseId = args.usecaseId ?? null;
  const max = await prisma.mfChecklistAssessment.findFirst({
    where: { orgId: args.orgId, usecaseId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (max?.version ?? 0) + 1;
  const catalog = await getCatalog();
  const items = flattenItems(catalog);

  return prisma.$transaction(async (tx) => {
    const a = await tx.mfChecklistAssessment.create({
      data: {
        orgId: args.orgId,
        usecaseId,
        version,
        status: "draft",
        title: args.title,
        createdById: args.userId,
      },
    });
    if (items.length > 0) {
      await tx.mfChecklistAnswer.createMany({
        data: items.map((it) => ({
          assessmentId: a.id,
          itemCode: it.code,
          status: "unanswered" as const,
        })),
      });
    }
    return a;
  });
}

export async function saveAnswer(args: {
  orgId: string;
  id: string;
  userId: string;
  itemCode: string;
  status: CheckStatusInput;
  elaboration?: string;
  evidenceRefs: string[];
}): Promise<{ ok: true }> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new MfChecklistStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  await prisma.mfChecklistAnswer.upsert({
    where: {
      assessmentId_itemCode: { assessmentId: args.id, itemCode: args.itemCode },
    },
    update: {
      status: args.status,
      elaboration: args.elaboration ?? null,
      evidenceRefs: args.evidenceRefs,
    },
    create: {
      assessmentId: args.id,
      itemCode: args.itemCode,
      status: args.status,
      elaboration: args.elaboration ?? null,
      evidenceRefs: args.evidenceRefs,
    },
  });
  return { ok: true };
}

export async function submitAssessment(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<MfChecklistAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new MfChecklistStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  const answers = await prisma.mfChecklistAnswer.findMany({
    where: { assessmentId: args.id },
    select: { status: true },
  });
  if (answers.some((a) => a.status === "unanswered")) {
    throw new MfChecklistStateError(
      "Cannot submit: every item must be answered (Yes / No / N·A)",
    );
  }
  return prisma.mfChecklistAssessment.update({
    where: { id: args.id },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      submittedById: args.userId,
    },
  });
}

export async function unsubmitAssessment(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<MfChecklistAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new MfChecklistStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  return prisma.mfChecklistAssessment.update({
    where: { id: args.id },
    data: { status: "draft", submittedAt: null, submittedById: null },
  });
}

export async function approveAssessment(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<MfChecklistAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new MfChecklistStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  if (row.createdById === args.userId) {
    throw new MfChecklistStateError(
      "Cannot self-approve a MindForge checklist assessment",
    );
  }
  return prisma.mfChecklistAssessment.update({
    where: { id: args.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: args.userId,
    },
  });
}

export async function archiveAssessment(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<MfChecklistAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "approved") {
    throw new MfChecklistStateError(
      `Assessment ${args.id} is not approved (current: ${row.status})`,
    );
  }
  return prisma.mfChecklistAssessment.update({
    where: { id: args.id },
    data: {
      status: "archived",
      archivedAt: new Date(),
      archivedById: args.userId,
    },
  });
}

export async function newVersion(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<{
  archived: MfChecklistAssessment;
  created: MfChecklistAssessment;
}> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.mfChecklistAssessment.findFirst({
      where: { id: args.id, orgId: args.orgId, status: "approved" },
    });
    if (!current)
      throw new MfChecklistStateError(
        "Only approved assessments can be revised",
      );
    const created = await tx.mfChecklistAssessment.create({
      data: {
        orgId: args.orgId,
        usecaseId: current.usecaseId,
        version: current.version + 1,
        status: "draft",
        title: current.title,
        createdById: args.userId,
      },
    });
    const prior = await tx.mfChecklistAnswer.findMany({
      where: { assessmentId: current.id },
    });
    if (prior.length > 0) {
      await tx.mfChecklistAnswer.createMany({
        data: prior.map((p) => ({
          assessmentId: created.id,
          itemCode: p.itemCode,
          status: p.status,
          elaboration: p.elaboration,
          evidenceRefs: p.evidenceRefs ?? [],
        })),
      });
    }
    const archived = await tx.mfChecklistAssessment.update({
      where: { id: current.id },
      data: {
        status: "archived",
        archivedAt: new Date(),
        archivedById: args.userId,
        supersededById: created.id,
      },
    });
    return { archived, created };
  });
}
