export type ApprovalFingerprint = {
  boundTier: number | null;
  boundModelRef: string | null;
};

export type CurrentFingerprint = {
  effectiveTier: number | null;
  modelRef: string;
};

/** Latest model version string, or the sentinel `"none"` when no version exists. */
export function formatModelRef(version: string | null | undefined): string {
  return version ?? "none";
}

export function isActiveApproval(
  status: string,
): status is "approved" | "live" {
  return status === "approved" || status === "live";
}

/** Legacy rows without bound metadata are never treated as drifted. */
export function hasApprovalBinding(bound: ApprovalFingerprint): boolean {
  return bound.boundTier != null || bound.boundModelRef != null;
}

export function approvalFingerprintDrifted(
  bound: ApprovalFingerprint,
  current: CurrentFingerprint,
): boolean {
  if (!hasApprovalBinding(bound)) return false;
  return (
    bound.boundTier !== current.effectiveTier ||
    bound.boundModelRef !== current.modelRef
  );
}

export function approvalNeedsReReview(
  goLive: {
    status: string;
    boundTier: number | null;
    boundModelRef: string | null;
    staleApproval: boolean;
  } | null,
  capability: { effectiveTier: number | null },
  modelRef: string,
): boolean {
  if (!goLive || !isActiveApproval(goLive.status)) return false;
  if (goLive.staleApproval) return true;
  return approvalFingerprintDrifted(
    {
      boundTier: goLive.boundTier,
      boundModelRef: goLive.boundModelRef,
    },
    { effectiveTier: capability.effectiveTier, modelRef },
  );
}
