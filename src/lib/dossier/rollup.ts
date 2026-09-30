import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { buildDossierSnapshot } from "./aggregate";
import { evaluateReadiness } from "./readiness";
import type { GoLiveState } from "./types";

export interface BlockedRow {
  usecaseId: string;
  name: string;
  ownerName: string | null;
  isHighRisk: boolean;
  euAiActCategory: string | null;
  blockingCheckIds: string[];
}

export interface ReadinessRollup {
  counts: Record<GoLiveState, number> & { highRiskBlocked: number };
  blocked: BlockedRow[];
}

const BATCH = 10;

export async function buildReadinessRollup(
  db: OrgScopedClient,
  orgId: string,
): Promise<ReadinessRollup> {
  const usecases = await db.aiUsecase.findMany({
    where: { orgId, lifecycleStage: { in: ["development", "production"] } },
    select: { id: true },
  });

  const counts: ReadinessRollup["counts"] = {
    ready: 0,
    conditionally_ready: 0,
    not_ready: 0,
    live: 0,
    needs_re_review: 0,
    highRiskBlocked: 0,
  };
  const blocked: BlockedRow[] = [];

  for (let i = 0; i < usecases.length; i += BATCH) {
    const slice = usecases.slice(i, i + BATCH);
    const snaps = await Promise.all(
      slice.map((u) => buildDossierSnapshot(db, orgId, u.id)),
    );
    for (const snap of snaps) {
      if (!snap) continue; // deleted mid-iteration
      const evaluation = evaluateReadiness(snap);
      counts[evaluation.state] += 1;
      if (evaluation.state === "not_ready") {
        const isHighRisk = snap.classification.isHighRisk;
        if (isHighRisk) counts.highRiskBlocked += 1;
        blocked.push({
          usecaseId: snap.system.id,
          name: snap.system.name,
          ownerName: snap.system.ownerName,
          isHighRisk,
          euAiActCategory: snap.classification.euAiActCategory,
          blockingCheckIds: evaluation.checks
            .filter((c) => c.severity === "blocking" && c.status === "fail")
            .map((c) => c.id),
        });
      }
    }
  }

  blocked.sort((a, b) => {
    if (a.isHighRisk !== b.isHighRisk) return a.isHighRisk ? -1 : 1;
    if (a.blockingCheckIds.length !== b.blockingCheckIds.length)
      return b.blockingCheckIds.length - a.blockingCheckIds.length;
    return a.name.localeCompare(b.name);
  });

  return { counts, blocked };
}
