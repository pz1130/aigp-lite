import { prisma } from "@/lib/db";
import type { AivtfAssessment } from "@/lib/prisma";
import { getCatalog, flattenProcesses } from "./catalog";
import type { CheckStatusInput } from "./answer-schema";

export class AivtfStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AivtfStateError";
  }
}

async function loadOwn(orgId: string, id: string): Promise<AivtfAssessment> {
  const row = await prisma.aivtfAssessment.findFirst({ where: { id, orgId } });
  if (!row)
    throw new AivtfStateError(
      `AIVTF assessment ${id} not found in org ${orgId}`,
    );
  return row;
}

export async function createAssessment(args: {
  orgId: string;
  userId: string;
  usecaseId?: string | null;
  title: string;
}): Promise<AivtfAssessment> {
  const usecaseId = args.usecaseId ?? null;
  const max = await prisma.aivtfAssessment.findFirst({
    where: { orgId: args.orgId, usecaseId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (max?.version ?? 0) + 1;
  const catalog = await getCatalog();
  const processes = flattenProcesses(catalog);

  return prisma.$transaction(async (tx) => {
    const a = await tx.aivtfAssessment.create({
      data: {
        orgId: args.orgId,
        usecaseId,
        version,
        status: "draft",
        title: args.title,
        createdById: args.userId,
      },
    });
    if (processes.length > 0) {
      await tx.aivtfAnswer.createMany({
        data: processes.map((p) => ({
          assessmentId: a.id,
          processCode: p.code,
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
  processCode: string;
  status: CheckStatusInput;
  elaboration?: string;
  evidenceRefs: string[];
}): Promise<{ ok: true }> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new AivtfStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  await prisma.aivtfAnswer.upsert({
    where: {
      assessmentId_processCode: {
        assessmentId: args.id,
        processCode: args.processCode,
      },
    },
    update: {
      status: args.status,
      elaboration: args.elaboration ?? null,
      evidenceRefs: args.evidenceRefs,
    },
    create: {
      assessmentId: args.id,
      processCode: args.processCode,
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
}): Promise<AivtfAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new AivtfStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  const answers = await prisma.aivtfAnswer.findMany({
    where: { assessmentId: args.id },
    select: { status: true },
  });
  if (answers.some((a) => a.status === "unanswered")) {
    throw new AivtfStateError(
      "Cannot submit: every process must be answered (Yes / No / N·A)",
    );
  }
  return prisma.aivtfAssessment.update({
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
}): Promise<AivtfAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new AivtfStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  return prisma.aivtfAssessment.update({
    where: { id: args.id },
    data: { status: "draft", submittedAt: null, submittedById: null },
  });
}

export async function approveAssessment(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<AivtfAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new AivtfStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  if (row.createdById === args.userId) {
    throw new AivtfStateError("Cannot self-approve an AIVTF assessment");
  }
  return prisma.aivtfAssessment.update({
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
}): Promise<AivtfAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "approved") {
    throw new AivtfStateError(
      `Assessment ${args.id} is not approved (current: ${row.status})`,
    );
  }
  return prisma.aivtfAssessment.update({
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
}): Promise<{ archived: AivtfAssessment; created: AivtfAssessment }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.aivtfAssessment.findFirst({
      where: { id: args.id, orgId: args.orgId, status: "approved" },
    });
    if (!current)
      throw new AivtfStateError("Only approved assessments can be revised");
    const created = await tx.aivtfAssessment.create({
      data: {
        orgId: args.orgId,
        usecaseId: current.usecaseId,
        version: current.version + 1,
        status: "draft",
        title: current.title,
        createdById: args.userId,
      },
    });
    const prior = await tx.aivtfAnswer.findMany({
      where: { assessmentId: current.id },
    });
    if (prior.length > 0) {
      await tx.aivtfAnswer.createMany({
        data: prior.map((p) => ({
          assessmentId: created.id,
          processCode: p.processCode,
          status: p.status,
          elaboration: p.elaboration,
          evidenceRefs: p.evidenceRefs ?? [],
        })),
      });
    }
    const archived = await tx.aivtfAssessment.update({
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
