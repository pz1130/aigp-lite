import { prisma } from "@/lib/db";
import type { FrtAssessment } from "@/lib/prisma";
import { getCatalog, flattenThresholds } from "./catalog";
import type { FrtStatusInput } from "./answer-schema";

export class FrontierRiskTierStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontierRiskTierStateError";
  }
}

async function loadOwn(orgId: string, id: string): Promise<FrtAssessment> {
  const row = await prisma.frtAssessment.findFirst({ where: { id, orgId } });
  if (!row)
    throw new FrontierRiskTierStateError(
      `Frontier-risk-tier assessment ${id} not found in org ${orgId}`,
    );
  return row;
}

export async function createAssessment(args: {
  orgId: string;
  userId: string;
  usecaseId?: string | null;
  title: string;
}): Promise<FrtAssessment> {
  const usecaseId = args.usecaseId ?? null;
  const max = await prisma.frtAssessment.findFirst({
    where: { orgId: args.orgId, usecaseId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (max?.version ?? 0) + 1;
  const catalog = await getCatalog();
  const thresholds = flattenThresholds(catalog);

  return prisma.$transaction(async (tx) => {
    const a = await tx.frtAssessment.create({
      data: {
        orgId: args.orgId,
        usecaseId,
        version,
        status: "draft",
        title: args.title,
        createdById: args.userId,
      },
    });
    if (thresholds.length > 0) {
      await tx.frtAnswer.createMany({
        data: thresholds.map((th) => ({
          assessmentId: a.id,
          thresholdCode: th.code,
          status: "unanswered",
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
  thresholdCode: string;
  status: FrtStatusInput;
  elaboration?: string;
  evidenceRefs: string[];
}): Promise<{ ok: true }> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new FrontierRiskTierStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  await prisma.frtAnswer.upsert({
    where: {
      assessmentId_thresholdCode: {
        assessmentId: args.id,
        thresholdCode: args.thresholdCode,
      },
    },
    update: {
      status: args.status,
      elaboration: args.elaboration ?? null,
      evidenceRefs: args.evidenceRefs,
    },
    create: {
      assessmentId: args.id,
      thresholdCode: args.thresholdCode,
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
}): Promise<FrtAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new FrontierRiskTierStateError(
      `Assessment ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  const answers = await prisma.frtAnswer.findMany({
    where: { assessmentId: args.id },
    select: { status: true },
  });
  if (answers.some((a) => a.status === "unanswered")) {
    throw new FrontierRiskTierStateError(
      "Cannot submit: every threshold must be answered (Met / Not met / N/A)",
    );
  }
  return prisma.frtAssessment.update({
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
}): Promise<FrtAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new FrontierRiskTierStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  return prisma.frtAssessment.update({
    where: { id: args.id },
    data: { status: "draft", submittedAt: null, submittedById: null },
  });
}

export async function approveAssessment(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<FrtAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new FrontierRiskTierStateError(
      `Assessment ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  if (row.createdById === args.userId) {
    throw new FrontierRiskTierStateError(
      "Cannot self-approve a frontier-risk-tier assessment",
    );
  }
  return prisma.frtAssessment.update({
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
}): Promise<FrtAssessment> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "approved") {
    throw new FrontierRiskTierStateError(
      `Assessment ${args.id} is not approved (current: ${row.status})`,
    );
  }
  return prisma.frtAssessment.update({
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
}): Promise<{ archived: FrtAssessment; created: FrtAssessment }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.frtAssessment.findFirst({
      where: { id: args.id, orgId: args.orgId, status: "approved" },
    });
    if (!current)
      throw new FrontierRiskTierStateError(
        "Only approved assessments can be revised",
      );
    const created = await tx.frtAssessment.create({
      data: {
        orgId: args.orgId,
        usecaseId: current.usecaseId,
        version: current.version + 1,
        status: "draft",
        title: current.title,
        createdById: args.userId,
      },
    });
    const prior = await tx.frtAnswer.findMany({
      where: { assessmentId: current.id },
    });
    if (prior.length > 0) {
      await tx.frtAnswer.createMany({
        data: prior.map((p) => ({
          assessmentId: created.id,
          thresholdCode: p.thresholdCode,
          status: p.status,
          elaboration: p.elaboration,
          evidenceRefs: p.evidenceRefs ?? [],
        })),
      });
    }
    const archived = await tx.frtAssessment.update({
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
