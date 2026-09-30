import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import type { Prisma, TxrReport } from "@/lib/prisma";
import { requiredSectionKeys, SECTION_KEYS } from "./sections";
import { buildSnapshot, type TxrSnapshot } from "./aggregate";
import { buildOrgSnapshot, type TxrOrgSnapshot } from "./org-aggregate";

export class TransparencyReportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransparencyReportStateError";
  }
}

async function loadOwn(orgId: string, id: string): Promise<TxrReport> {
  const row = await prisma.txrReport.findFirst({ where: { id, orgId } });
  if (!row)
    throw new TransparencyReportStateError(
      `Transparency report ${id} not found in org ${orgId}`,
    );
  return row;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

export async function createReport(args: {
  orgId: string;
  userId: string;
  usecaseId?: string | null;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
}): Promise<TxrReport> {
  const usecaseId = args.usecaseId ?? null;
  const max = await prisma.txrReport.findFirst({
    where: { orgId: args.orgId, usecaseId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return prisma.txrReport.create({
    data: {
      orgId: args.orgId,
      usecaseId,
      version: (max?.version ?? 0) + 1,
      status: "draft",
      title: args.title,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      periodLabel: args.periodLabel,
      createdById: args.userId,
    },
  });
}

export async function saveSection(args: {
  orgId: string;
  id: string;
  userId: string;
  key: string;
  text: string;
}): Promise<{ ok: true }> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new TransparencyReportStateError(
      `Report ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  if (!SECTION_KEYS.has(args.key)) {
    throw new TransparencyReportStateError(`Unknown section key: ${args.key}`);
  }
  const sections = {
    ...(row.sections as Record<string, string>),
    [args.key]: args.text,
  };
  await prisma.txrReport.update({
    where: { id: args.id },
    data: { sections: sections as Prisma.InputJsonValue },
  });
  return { ok: true };
}

export async function submitReport(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<TxrReport> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "draft") {
    throw new TransparencyReportStateError(
      `Report ${args.id} is not in draft (current: ${row.status})`,
    );
  }
  const sections = (row.sections as Record<string, string>) ?? {};
  const missing = requiredSectionKeys().filter(
    (k) => !sections[k] || sections[k].trim() === "",
  );
  if (missing.length > 0) {
    throw new TransparencyReportStateError(
      `Cannot submit: required sections are empty: ${missing.join(", ")}`,
    );
  }
  if (row.usecaseId === null) {
    const activeCount = await prisma.aiUsecase.count({
      where: {
        orgId: args.orgId,
        lifecycleStage: { in: ["development", "production", "deprecated"] },
      },
    });
    if (activeCount === 0) {
      throw new TransparencyReportStateError(
        "Cannot submit: an organization-level report needs at least one active system",
      );
    }
  } else {
    const approvedFrt = await prisma.frtAssessment.findFirst({
      where: {
        orgId: args.orgId,
        usecaseId: row.usecaseId,
        status: "approved",
      },
      select: { id: true },
    });
    if (!approvedFrt) {
      throw new TransparencyReportStateError(
        "Cannot submit: an approved Frontier Risk Tier assessment is required for this scope",
      );
    }
  }
  return prisma.txrReport.update({
    where: { id: args.id },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      submittedById: args.userId,
    },
  });
}

export async function unsubmitReport(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<TxrReport> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new TransparencyReportStateError(
      `Report ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  return prisma.txrReport.update({
    where: { id: args.id },
    data: { status: "draft", submittedAt: null, submittedById: null },
  });
}

export async function approveReport(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<TxrReport> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "submitted") {
    throw new TransparencyReportStateError(
      `Report ${args.id} is not submitted (current: ${row.status})`,
    );
  }
  if (row.createdById === args.userId) {
    throw new TransparencyReportStateError(
      "Cannot self-approve a transparency report",
    );
  }
  return prisma.txrReport.update({
    where: { id: args.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: args.userId,
    },
  });
}

export async function publishReport(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<TxrReport> {
  const row = await loadOwn(args.orgId, args.id);
  if (row.status !== "approved") {
    throw new TransparencyReportStateError(
      `Report ${args.id} is not approved (current: ${row.status})`,
    );
  }
  const scoped = withOrg(prisma, args.orgId);
  const prior = await prisma.txrReport.findFirst({
    where: { orgId: args.orgId, usecaseId: row.usecaseId, status: "published" },
    orderBy: { version: "desc" },
    select: { version: true, periodLabel: true, snapshot: true },
  });
  let snapshot: TxrSnapshot | TxrOrgSnapshot;
  if (row.usecaseId === null) {
    const priorOrg = await prisma.txrReport.findFirst({
      where: { orgId: args.orgId, usecaseId: null, status: "published" },
      orderBy: { version: "desc" },
      select: { version: true, periodLabel: true, snapshot: true },
    });
    const priorSnap =
      priorOrg?.snapshot && "portfolio" in (priorOrg.snapshot as object)
        ? (priorOrg.snapshot as unknown as TxrOrgSnapshot)
        : null;
    snapshot = await buildOrgSnapshot(
      scoped,
      {
        orgId: args.orgId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
      },
      priorSnap && priorOrg
        ? {
            report: {
              version: priorOrg.version,
              periodLabel: priorOrg.periodLabel,
            },
            snapshot: priorSnap,
          }
        : null,
    );
  } else {
    snapshot = await buildSnapshot(
      scoped,
      {
        orgId: args.orgId,
        usecaseId: row.usecaseId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
      },
      prior?.snapshot
        ? {
            report: { version: prior.version, periodLabel: prior.periodLabel },
            snapshot: prior.snapshot as unknown as TxrSnapshot,
          }
        : null,
    );
  }
  return prisma.txrReport.update({
    where: { id: args.id },
    data: {
      status: "published",
      publishedAt: new Date(),
      publishedById: args.userId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function newVersion(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<{ superseded: TxrReport; created: TxrReport }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.txrReport.findFirst({
      where: { id: args.id, orgId: args.orgId, status: "published" },
    });
    if (!current)
      throw new TransparencyReportStateError(
        "Only published reports can be revised",
      );
    const created = await tx.txrReport.create({
      data: {
        orgId: args.orgId,
        usecaseId: current.usecaseId,
        version: current.version + 1,
        status: "draft",
        title: current.title,
        periodStart: current.periodEnd,
        periodEnd: addMonths(current.periodEnd, 6),
        periodLabel: current.periodLabel,
        sections: current.sections as Prisma.InputJsonValue,
        createdById: args.userId,
      },
    });
    const superseded = await tx.txrReport.update({
      where: { id: current.id },
      data: { status: "superseded", supersededById: created.id },
    });
    return { superseded, created };
  });
}
