import { prisma } from "@/lib/db";
import type { UsecaseFria } from "@/lib/prisma";
import { friaSectionsSchema, type FriaSections } from "./sections-schema";

export class FriaStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriaStateError";
  }
}

export async function createFria(args: {
  orgId: string;
  usecaseId: string;
  userId: string;
  title: string;
  initialSections?: Partial<FriaSections>;
}): Promise<UsecaseFria> {
  const sections = args.initialSections ?? {};
  const max = await prisma.usecaseFria.findFirst({
    where: { usecaseId: args.usecaseId, orgId: args.orgId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (max?.version ?? 0) + 1;
  return prisma.usecaseFria.create({
    data: {
      orgId: args.orgId,
      usecaseId: args.usecaseId,
      version,
      status: "draft",
      title: args.title,
      sectionsJson: sections as object,
      createdById: args.userId,
    },
  });
}

export async function updateDraftSections(args: {
  orgId: string;
  friaId: string;
  userId: string;
  sections: FriaSections;
}): Promise<UsecaseFria> {
  const row = await loadOwn(args.orgId, args.friaId);
  if (row.status !== "draft") {
    throw new FriaStateError(
      `FRIA ${args.friaId} is not in draft (current: ${row.status})`,
    );
  }
  friaSectionsSchema.parse(args.sections);
  return prisma.usecaseFria.update({
    where: { id: args.friaId },
    data: { sectionsJson: args.sections as object },
  });
}

export async function submitFria(args: {
  orgId: string;
  friaId: string;
  userId: string;
}): Promise<UsecaseFria> {
  const row = await loadOwn(args.orgId, args.friaId);
  if (row.status !== "draft") {
    throw new FriaStateError(
      `FRIA ${args.friaId} is not in draft (current: ${row.status})`,
    );
  }
  const sections =
    (row.sectionsJson as { system?: { name?: string } } | null) ?? {};
  const name = sections.system?.name?.trim() ?? "";
  if (name.length === 0) {
    throw new FriaStateError(
      "FRIA cannot be submitted: sections.system.name is empty",
    );
  }
  return prisma.usecaseFria.update({
    where: { id: args.friaId },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      submittedById: args.userId,
    },
  });
}

export async function withdrawFria(args: {
  orgId: string;
  friaId: string;
  userId: string;
}): Promise<UsecaseFria> {
  const row = await loadOwn(args.orgId, args.friaId);
  if (row.status !== "submitted") {
    throw new FriaStateError(
      `FRIA ${args.friaId} is not submitted (current: ${row.status})`,
    );
  }
  return prisma.usecaseFria.update({
    where: { id: args.friaId },
    data: { status: "draft", submittedAt: null, submittedById: null },
  });
}

export async function approveFria(args: {
  orgId: string;
  friaId: string;
  userId: string;
}): Promise<UsecaseFria> {
  const row = await loadOwn(args.orgId, args.friaId);
  if (row.status !== "submitted") {
    throw new FriaStateError(
      `FRIA ${args.friaId} is not submitted (current: ${row.status})`,
    );
  }
  if (row.createdById === args.userId) {
    throw new FriaStateError("Cannot self-approve a FRIA");
  }
  return prisma.usecaseFria.update({
    where: { id: args.friaId },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: args.userId,
    },
  });
}

export async function supersedeFria(args: {
  orgId: string;
  friaId: string;
  userId: string;
}): Promise<{ archived: UsecaseFria; created: UsecaseFria }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.usecaseFria.findFirst({
      where: { id: args.friaId, orgId: args.orgId, status: "approved" },
    });
    if (!current) {
      throw new FriaStateError("Only approved FRIAs can be superseded");
    }
    const created = await tx.usecaseFria.create({
      data: {
        orgId: args.orgId,
        usecaseId: current.usecaseId,
        version: current.version + 1,
        status: "draft",
        title: current.title,
        sectionsJson: current.sectionsJson as object,
        createdById: args.userId,
      },
    });
    const archived = await tx.usecaseFria.update({
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

export async function archiveFria(args: {
  orgId: string;
  friaId: string;
  userId: string;
}): Promise<UsecaseFria> {
  const row = await loadOwn(args.orgId, args.friaId);
  if (row.status !== "approved") {
    throw new FriaStateError(
      `FRIA ${args.friaId} is not approved (current: ${row.status})`,
    );
  }
  return prisma.usecaseFria.update({
    where: { id: args.friaId },
    data: {
      status: "archived",
      archivedAt: new Date(),
      archivedById: args.userId,
    },
  });
}

export async function listFriasForUsecase(args: {
  orgId: string;
  usecaseId: string;
}): Promise<{ current: UsecaseFria | null; history: UsecaseFria[] }> {
  const all = await prisma.usecaseFria.findMany({
    where: { orgId: args.orgId, usecaseId: args.usecaseId },
    orderBy: { version: "desc" },
  });
  const current = all.find((r) => r.status !== "archived") ?? null;
  const history = all.filter((r) => r.status === "archived");
  return { current, history };
}

async function loadOwn(orgId: string, friaId: string): Promise<UsecaseFria> {
  const row = await prisma.usecaseFria.findFirst({
    where: { id: friaId, orgId },
  });
  if (!row)
    throw new FriaStateError(`FRIA ${friaId} not found in org ${orgId}`);
  return row;
}
