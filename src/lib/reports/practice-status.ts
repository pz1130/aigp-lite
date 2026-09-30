import { prisma } from "@/lib/db";
import type { ControlStatus } from "@/lib/prisma";

export type EffectiveStatus = {
  usecaseId: string;
  status: ControlStatus;
  source: "direct" | "inherited";
  inheritedFrom?: { framework: string; code: string };
};

const RANK: Record<ControlStatus, number> = {
  satisfied: 4,
  in_progress: 3,
  failed: 2,
  not_started: 1,
  not_applicable: 0,
};

/**
 * Effective per-usecase status of one MindForge practice control across an org.
 * Direct UsecaseControlStatus on the practice wins; otherwise the best status
 * inherited from an *equivalent* crosswalk target is used (not_applicable target
 * rows are ignored). 'related' crosswalks grant no status. A practice with no
 * crosswalk degenerates to exactly its direct rows.
 */
export async function resolvePracticeStatuses(
  orgId: string,
  practiceControlId: string,
): Promise<EffectiveStatus[]> {
  const directRows = await prisma.usecaseControlStatus.findMany({
    where: { orgId, controlId: practiceControlId },
    select: { usecaseId: true, status: true },
  });
  const directByUsecase = new Map<string, ControlStatus>();
  for (const r of directRows) directByUsecase.set(r.usecaseId, r.status);

  const xwalks = await prisma.controlCrosswalk.findMany({
    where: { sourceControlId: practiceControlId, relation: "equivalent" },
    select: {
      targetControlId: true,
      target: { select: { code: true, framework: { select: { code: true } } } },
    },
  });
  const targetMeta = new Map<string, { framework: string; code: string }>();
  for (const x of xwalks)
    targetMeta.set(x.targetControlId, {
      framework: x.target.framework.code,
      code: x.target.code,
    });
  const targetIds = [...targetMeta.keys()];

  const inheritedByUsecase = new Map<
    string,
    { status: ControlStatus; from: { framework: string; code: string } }
  >();
  if (targetIds.length > 0) {
    const targetRows = await prisma.usecaseControlStatus.findMany({
      where: { orgId, controlId: { in: targetIds } },
      select: { usecaseId: true, controlId: true, status: true },
    });
    for (const r of targetRows) {
      if (r.status === "not_applicable") continue;
      const prev = inheritedByUsecase.get(r.usecaseId);
      if (!prev || RANK[r.status] > RANK[prev.status]) {
        inheritedByUsecase.set(r.usecaseId, {
          status: r.status,
          from: targetMeta.get(r.controlId)!,
        });
      }
    }
  }

  const out: EffectiveStatus[] = [];
  const usecaseIds = new Set<string>([
    ...directByUsecase.keys(),
    ...inheritedByUsecase.keys(),
  ]);
  for (const usecaseId of usecaseIds) {
    if (directByUsecase.has(usecaseId)) {
      out.push({
        usecaseId,
        status: directByUsecase.get(usecaseId)!,
        source: "direct",
      });
    } else {
      const inh = inheritedByUsecase.get(usecaseId)!;
      out.push({
        usecaseId,
        status: inh.status,
        source: "inherited",
        inheritedFrom: inh.from,
      });
    }
  }
  return out;
}
