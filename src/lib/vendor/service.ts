import { prisma } from "@/lib/db";
import type {
  VendorType,
  VendorRiskRating,
  DueDiligenceStatus,
} from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";
import { DUE_DILIGENCE_CATALOG, type AnswerLite } from "./catalog";
import { computeRating } from "./scoring";

export class VendorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorError";
  }
}

interface AnswerInput {
  itemCode: string;
  status: DueDiligenceStatus;
  note?: string | null;
}

const withVendor = {
  answers: true,
  usecases: { include: { usecase: { select: { id: true, name: true } } } },
} as const;

async function loadOwn(orgId: string, vendorId: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, orgId },
    include: withVendor,
  });
  if (!vendor) throw new VendorError("Vendor not found");
  return vendor;
}

export function listVendors(orgId: string) {
  return prisma.vendor.findMany({
    where: { orgId },
    include: withVendor,
    orderBy: { name: "asc" },
  });
}

export function getVendor(orgId: string, vendorId: string) {
  return prisma.vendor.findFirst({
    where: { id: vendorId, orgId },
    include: withVendor,
  });
}

export async function createVendor(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  input: {
    name: string;
    vendorType: VendorType;
    description?: string | null;
    providerConnectionId?: string | null;
    dataResidency?: string | null;
    contractRenewalDate?: Date | null;
    modelChangeNotice?: boolean;
  };
}) {
  const { orgId, actorId, ip, input } = args;
  const vendor = await prisma.vendor.create({
    data: {
      orgId,
      name: input.name,
      vendorType: input.vendorType,
      description: input.description ?? null,
      providerConnectionId: input.providerConnectionId ?? null,
      dataResidency: input.dataResidency ?? null,
      contractRenewalDate: input.contractRenewalDate ?? null,
      modelChangeNotice: input.modelChangeNotice ?? false,
    },
    include: withVendor,
  });
  await writeAudit({
    orgId,
    actorId,
    action: "vendor.create",
    resourceType: "vendor",
    resourceId: vendor.id,
    after: { name: vendor.name, vendorType: vendor.vendorType },
    ip,
  });
  return vendor;
}

export async function updateVendor(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  vendorId: string;
  input: {
    name?: string;
    vendorType?: VendorType;
    description?: string | null;
    providerConnectionId?: string | null;
    dataResidency?: string | null;
    contractRenewalDate?: Date | null;
    modelChangeNotice?: boolean;
  };
}) {
  const { orgId, actorId, ip, vendorId, input } = args;
  const before = await loadOwn(orgId, vendorId);
  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      name: input.name ?? before.name,
      vendorType: input.vendorType ?? before.vendorType,
      description:
        input.description === undefined
          ? before.description
          : input.description,
      providerConnectionId:
        input.providerConnectionId === undefined
          ? before.providerConnectionId
          : input.providerConnectionId,
      dataResidency:
        input.dataResidency === undefined
          ? before.dataResidency
          : input.dataResidency,
      contractRenewalDate:
        input.contractRenewalDate === undefined
          ? before.contractRenewalDate
          : input.contractRenewalDate,
      modelChangeNotice: input.modelChangeNotice ?? before.modelChangeNotice,
    },
    include: withVendor,
  });
  await writeAudit({
    orgId,
    actorId,
    action: "vendor.update",
    resourceType: "vendor",
    resourceId: vendorId,
    before: { name: before.name, vendorType: before.vendorType },
    after: { name: vendor.name, vendorType: vendor.vendorType },
    ip,
  });
  return vendor;
}

export async function upsertAnswers(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  vendorId: string;
  answers: AnswerInput[];
}) {
  const { orgId, actorId, ip, vendorId, answers } = args;
  const vendor = await loadOwn(orgId, vendorId);

  const byCode = new Map(DUE_DILIGENCE_CATALOG.map((i) => [i.code, i]));
  for (const a of answers) {
    const item = byCode.get(a.itemCode);
    if (!item)
      throw new VendorError(`Unknown due-diligence item: ${a.itemCode}`);
    if (!item.appliesTo.includes(vendor.vendorType)) {
      throw new VendorError(
        `Item ${a.itemCode} does not apply to ${vendor.vendorType}`,
      );
    }
  }

  await prisma.$transaction(
    answers.map((a) =>
      prisma.vendorDueDiligenceAnswer.upsert({
        where: { vendorId_itemCode: { vendorId, itemCode: a.itemCode } },
        update: { status: a.status, note: a.note ?? null },
        create: {
          vendorId,
          itemCode: a.itemCode,
          status: a.status,
          note: a.note ?? null,
        },
      }),
    ),
  );

  const all = await prisma.vendorDueDiligenceAnswer.findMany({
    where: { vendorId },
    select: { itemCode: true, status: true },
  });
  const lite: AnswerLite[] = all.map((a) => ({
    itemCode: a.itemCode,
    status: a.status,
  }));
  const rating = computeRating(vendor.vendorType, lite);

  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      computedRating: rating,
      assessedById: actorId,
      assessedAt: new Date(),
    },
    include: withVendor,
  });
  await writeAudit({
    orgId,
    actorId,
    action: "vendor.assess",
    resourceType: "vendor",
    resourceId: vendorId,
    after: { computedRating: rating },
    ip,
  });
  return updated;
}

export async function setRatingOverride(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  vendorId: string;
  rating: VendorRiskRating;
  reason: string;
}) {
  const { orgId, actorId, ip, vendorId, rating, reason } = args;
  await loadOwn(orgId, vendorId);
  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data: { ratingOverride: rating, overrideReason: reason },
    include: withVendor,
  });
  await writeAudit({
    orgId,
    actorId,
    action: "vendor.override",
    resourceType: "vendor",
    resourceId: vendorId,
    after: { ratingOverride: rating, overrideReason: reason },
    ip,
  });
  return updated;
}

export async function clearOverride(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  vendorId: string;
}) {
  const { orgId, actorId, ip, vendorId } = args;
  await loadOwn(orgId, vendorId);
  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data: { ratingOverride: null, overrideReason: null },
    include: withVendor,
  });
  await writeAudit({
    orgId,
    actorId,
    action: "vendor.clear_override",
    resourceType: "vendor",
    resourceId: vendorId,
    ip,
  });
  return updated;
}

export async function linkUsecase(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  vendorId: string;
  usecaseId: string;
}) {
  const { orgId, actorId, ip, vendorId, usecaseId } = args;
  await loadOwn(orgId, vendorId);
  const usecase = await prisma.aiUsecase.findFirst({
    where: { id: usecaseId, orgId },
    select: { id: true },
  });
  if (!usecase) throw new VendorError("Use case not found");
  await prisma.vendorUsecaseLink.upsert({
    where: { vendorId_usecaseId: { vendorId, usecaseId } },
    update: {},
    create: { orgId, vendorId, usecaseId },
  });
  await writeAudit({
    orgId,
    actorId,
    action: "vendor.link",
    resourceType: "vendor",
    resourceId: vendorId,
    after: { usecaseId },
    ip,
  });
  return loadOwn(orgId, vendorId);
}

export async function unlinkUsecase(args: {
  orgId: string;
  actorId: string;
  ip?: string;
  vendorId: string;
  usecaseId: string;
}) {
  const { orgId, actorId, ip, vendorId, usecaseId } = args;
  await loadOwn(orgId, vendorId);
  await prisma.vendorUsecaseLink.deleteMany({ where: { vendorId, usecaseId } });
  await writeAudit({
    orgId,
    actorId,
    action: "vendor.unlink",
    resourceType: "vendor",
    resourceId: vendorId,
    before: { usecaseId },
    ip,
  });
  return loadOwn(orgId, vendorId);
}

export function listUsecaseVendors(orgId: string, usecaseId: string) {
  return prisma.vendorUsecaseLink.findMany({
    where: { orgId, usecaseId },
    include: { vendor: { include: withVendor } },
  });
}
