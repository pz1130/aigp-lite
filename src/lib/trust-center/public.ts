import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import { loadActiveTrustToken, touchTrustToken } from "./token";
import type { TrustConfidentialPayload, TrustPublicPayload } from "./aggregate";

export interface TrustPublicView {
  slug: string;
  displayName: string;
  contactEmail: string | null;
  version: number;
  publishedAt: Date | null;
  publicPayload: TrustPublicPayload;
}

export interface TrustConfidentialView extends TrustPublicView {
  snapshotId: string;
  confidentialPayload: TrustConfidentialPayload;
  versions: number[];
}

async function enabledProfile(slug: string) {
  return prisma.trustProfile.findFirst({ where: { slug, enabled: true } });
}

/**
 * The security boundary is this `select`, not a filter downstream:
 * `confidentialPayload` is never loaded into the process on the public path.
 */
export async function getPublicView(
  slug: string,
): Promise<TrustPublicView | null> {
  const profile = await enabledProfile(slug);
  if (!profile) return null;

  const snapshot = await prisma.trustSnapshot.findFirst({
    where: { orgId: profile.orgId, status: "published" },
    orderBy: { publishedAt: "desc" },
    select: { version: true, publishedAt: true, publicPayload: true },
  });
  if (!snapshot || snapshot.version === null) return null;

  return {
    slug: profile.slug,
    displayName: profile.displayName,
    contactEmail: profile.contactEmail,
    version: snapshot.version,
    publishedAt: snapshot.publishedAt,
    publicPayload: snapshot.publicPayload as unknown as TrustPublicPayload,
  };
}

export async function getConfidentialView(opts: {
  slug: string;
  tokenId: string;
  version?: number;
  ip?: string;
  userAgent?: string;
}): Promise<TrustConfidentialView | null> {
  const profile = await enabledProfile(opts.slug);
  if (!profile) return null;

  // Re-read on every request: revocation must take effect immediately.
  const token = await loadActiveTrustToken(opts.tokenId);
  if (!token || token.orgId !== profile.orgId) return null;

  const snapshot = await prisma.trustSnapshot.findFirst({
    where: {
      orgId: profile.orgId,
      ...(opts.version === undefined
        ? { status: "published" }
        : {
            version: opts.version,
            status: { in: ["published", "superseded"] },
          }),
    },
    orderBy: { publishedAt: "desc" },
  });
  if (!snapshot || snapshot.version === null) return null;

  const history = await prisma.trustSnapshot.findMany({
    where: {
      orgId: profile.orgId,
      status: { in: ["published", "superseded"] },
      version: { not: null },
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  await touchTrustToken(token.id);
  await writeAudit({
    orgId: profile.orgId,
    action: "trust.access",
    resourceType: "trust_snapshot",
    resourceId: snapshot.id,
    ip: opts.ip,
    userAgent: opts.userAgent,
    after: {
      tokenPrefix: token.tokenPrefix,
      label: token.label,
      version: snapshot.version,
    },
  });

  return {
    slug: profile.slug,
    displayName: profile.displayName,
    contactEmail: profile.contactEmail,
    snapshotId: snapshot.id,
    version: snapshot.version,
    publishedAt: snapshot.publishedAt,
    publicPayload: snapshot.publicPayload as unknown as TrustPublicPayload,
    confidentialPayload:
      snapshot.confidentialPayload as unknown as TrustConfidentialPayload,
    versions: history
      .map((h) => h.version)
      .filter((v): v is number => v !== null),
  };
}
