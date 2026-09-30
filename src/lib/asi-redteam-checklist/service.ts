import { prisma } from "@/lib/db";
import type { AsiChkAssessment } from "@/lib/prisma";
import { getCatalog, flattenItems } from "./catalog";
import type { CheckStatusInput } from "./answer-schema";

export class AsiRedteamChecklistStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsiRedteamChecklistStateError";
  }
}

async function loadOwn(orgId: string, id: string): Promise<AsiChkAssessment> {
  const row = await prisma.asiChkAssessment.findFirst({ where: { id, orgId } });
  if (!row)
    throw new AsiRedteamChecklistStateError(
      `ASI red-team checklist assessment ${id} not found in org ${orgId}`,
    );
  return row;
}

export async function createAssessment(args: {
  orgId: string;
  userId: string;
  usecaseId?: string | null;
  title: string;
}): Promise<AsiChkAssessment> {
  const usecaseId = args.usecaseId ?? null;
  const max = await prisma.asiChkAssessment.findFirst({
    where: { orgId: args.orgId, usecaseId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (max?.version ?? 0) + 1;
  const catalog = await getCatalog();
  const items = flattenItems(catalog);

  return prisma.$transaction(async (tx) => {
    const a = await tx.asiChkAssessment.create({
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
      await tx.asiChkAnswer.createMany({
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
    throw new AsiRedteamChecklistStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  await prisma.asiChkAnswer.upsert({
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
}): Promise<AsiChkAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new AsiRedteamChecklistStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  const answers = await prisma.asiChkAnswer.findMany({
    where: { assessmentId: args.id },
    select: { status: true },
  });
  if (answers.some((a) => a.status === "unanswered")) {
    throw new AsiRedteamChecklistStateError(
      "Cannot submit: every item must be answered (Yes / No / N·A)",
    );
  }
  return prisma.asiChkAssessment.update({
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
}): Promise<AsiChkAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new AsiRedteamChecklistStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  return prisma.asiChkAssessment.update({
    where: { id: args.id },
    data: { status: "draft", submittedAt: null, submittedById: null },
  });
}

export async function approveAssessment(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<AsiChkAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new AsiRedteamChecklistStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  if (row.createdById === args.userId) {
    throw new AsiRedteamChecklistStateError(
      "Cannot self-approve an ASI red-team checklist assessment",
    );
  }
  return prisma.asiChkAssessment.update({
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
}): Promise<AsiChkAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "approved") {
    throw new AsiRedteamChecklistStateError(
      `Assessment ${args.id} is not approved (current: ${row.status})`,
    );
  }
  return prisma.asiChkAssessment.update({
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
}): Promise<{ archived: AsiChkAssessment; created: AsiChkAssessment }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.asiChkAssessment.findFirst({
      where: { id: args.id, orgId: args.orgId, status: "approved" },
    });
    if (!current)
      throw new AsiRedteamChecklistStateError(
        "Only approved assessments can be revised",
      );
    const created = await tx.asiChkAssessment.create({
      data: {
        orgId: args.orgId,
        usecaseId: current.usecaseId,
        version: current.version + 1,
        status: "draft",
        title: current.title,
        createdById: args.userId,
      },
    });
    const prior = await tx.asiChkAnswer.findMany({
      where: { assessmentId: current.id },
    });
    if (prior.length > 0) {
      await tx.asiChkAnswer.createMany({
        data: prior.map((p) => ({
          assessmentId: created.id,
          itemCode: p.itemCode,
          status: p.status,
          elaboration: p.elaboration,
          evidenceRefs: p.evidenceRefs ?? [],
        })),
      });
    }
    const archived = await tx.asiChkAssessment.update({
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
