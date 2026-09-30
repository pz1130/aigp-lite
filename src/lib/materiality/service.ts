import { z } from "zod";
import type { UsecaseMateriality, MaterialityTier } from "@/lib/prisma";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import { computeTier, type MaterialityInputs } from "./rubric";

export class MaterialityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialityError";
  }
}

const score = z.number().int().min(0).max(3);
export const materialityInputsSchema = z.object({
  affectedParties: score,
  decisionConsequence: score,
  financialSafety: score,
  dataSensitivity: score,
});

export async function getMateriality(
  orgId: string,
  usecaseId: string,
): Promise<UsecaseMateriality | null> {
  return prisma.usecaseMateriality.findFirst({ where: { orgId, usecaseId } });
}

export async function upsertMateriality(args: {
  orgId: string;
  usecaseId: string;
  actorId: string;
  inputs: MaterialityInputs;
  ip?: string;
}): Promise<UsecaseMateriality> {
  const inputs = materialityInputsSchema.parse(args.inputs);

  const usecase = await prisma.aiUsecase.findFirst({
    where: { id: args.usecaseId, orgId: args.orgId },
    select: { autonomyLevel: true },
  });
  if (!usecase) {
    throw new MaterialityError(
      `Use case ${args.usecaseId} not found in org ${args.orgId}`,
    );
  }

  const { tier } = computeTier(inputs, usecase.autonomyLevel);

  const row = await prisma.usecaseMateriality.upsert({
    where: { usecaseId: args.usecaseId },
    create: {
      orgId: args.orgId,
      usecaseId: args.usecaseId,
      ...inputs,
      computedTier: tier,
      assessedById: args.actorId,
    },
    update: {
      ...inputs,
      computedTier: tier,
      assessedById: args.actorId,
      assessedAt: new Date(),
    },
  });

  await writeAudit({
    orgId: args.orgId,
    actorId: args.actorId,
    action: "materiality.assess",
    resourceType: "usecase_materiality",
    resourceId: row.id,
    after: { ...inputs, computedTier: tier },
    ip: args.ip,
  });

  return row;
}

async function loadOwn(
  orgId: string,
  usecaseId: string,
): Promise<UsecaseMateriality> {
  const row = await prisma.usecaseMateriality.findFirst({
    where: { orgId, usecaseId },
  });
  if (!row) {
    throw new MaterialityError(
      `Materiality for use case ${usecaseId} not found in org ${orgId}`,
    );
  }
  return row;
}

export async function setOverride(args: {
  orgId: string;
  usecaseId: string;
  actorId: string;
  tier: MaterialityTier;
  reason: string;
  ip?: string;
}): Promise<UsecaseMateriality> {
  const before = await loadOwn(args.orgId, args.usecaseId);
  const row = await prisma.usecaseMateriality.update({
    where: { id: before.id },
    data: {
      tierOverride: args.tier,
      overrideReason: args.reason,
      assessedById: args.actorId,
    },
  });
  await writeAudit({
    orgId: args.orgId,
    actorId: args.actorId,
    action: "materiality.override",
    resourceType: "usecase_materiality",
    resourceId: row.id,
    before: { tierOverride: before.tierOverride },
    after: { tierOverride: args.tier, overrideReason: args.reason },
    ip: args.ip,
  });
  return row;
}

export async function clearOverride(args: {
  orgId: string;
  usecaseId: string;
  actorId: string;
  ip?: string;
}): Promise<UsecaseMateriality> {
  const before = await loadOwn(args.orgId, args.usecaseId);
  const row = await prisma.usecaseMateriality.update({
    where: { id: before.id },
    data: {
      tierOverride: null,
      overrideReason: null,
      assessedById: args.actorId,
    },
  });
  await writeAudit({
    orgId: args.orgId,
    actorId: args.actorId,
    action: "materiality.override",
    resourceType: "usecase_materiality",
    resourceId: row.id,
    before: { tierOverride: before.tierOverride },
    after: { tierOverride: null },
    ip: args.ip,
  });
  return row;
}
