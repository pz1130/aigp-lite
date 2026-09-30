import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { workflowEvents } from "@/lib/events/workflow-bus";
import { buildDossierSnapshot } from "./aggregate";
import {
  approvalFingerprintDrifted,
  formatModelRef,
  hasApprovalBinding,
} from "./approval-fingerprint";

/**
 * Compares the active go-live approval fingerprint to the current system state.
 * On first drift, persists `staleApproval` and emits `go-live.stale` for notification.
 */
export async function recheckStaleApproval(
  db: OrgScopedClient,
  orgId: string,
  usecaseId: string,
  opts?: { triggeredByUserId?: string },
): Promise<boolean> {
  const review = await db.goLiveReview.findFirst({
    where: {
      orgId,
      usecaseId,
      supersededById: null,
      status: { in: ["approved", "live"] },
    },
  });
  if (!review || review.staleApproval) return false;
  if (
    !hasApprovalBinding({
      boundTier: review.boundTier,
      boundModelRef: review.boundModelRef,
    })
  ) {
    return false;
  }

  const snapshot = await buildDossierSnapshot(db, orgId, usecaseId);
  if (!snapshot) return false;

  const drifted = approvalFingerprintDrifted(
    {
      boundTier: review.boundTier,
      boundModelRef: review.boundModelRef,
    },
    {
      effectiveTier: snapshot.capability.effectiveTier,
      modelRef: snapshot.modelRef,
    },
  );
  if (!drifted) return false;

  await db.goLiveReview.update({
    where: { id: review.id },
    data: { staleApproval: true },
  });

  workflowEvents.emitGoLiveStale({
    orgId,
    usecaseId,
    reviewId: review.id,
    triggeredByUserId: opts?.triggeredByUserId,
  });
  return true;
}

/** Resolve bound fingerprint fields at approval/live decision time. */
export async function resolveApprovalBinding(
  db: OrgScopedClient,
  usecaseId: string,
  effectiveTier: number | null,
): Promise<{ boundTier: number | null; boundModelRef: string }> {
  const latest = await db.aiModelVersion.findFirst({
    where: { usecaseId },
    orderBy: { createdAt: "desc" },
    select: { version: true },
  });
  return {
    boundTier: effectiveTier,
    boundModelRef: formatModelRef(latest?.version),
  };
}
