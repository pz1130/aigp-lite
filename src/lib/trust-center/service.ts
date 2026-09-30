import { prisma } from "@/lib/db";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { buildTrustPayloads } from "./aggregate";

export class TrustStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustStateError";
  }
}

const STALE_AFTER_DAYS = 90;

export function isTrustSnapshotStale(
  publishedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!publishedAt) return true;
  const ageMs = now.getTime() - publishedAt.getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export async function saveTrustProfile(opts: {
  orgId: string;
  slug: string;
  displayName: string;
  intro: string;
  contactEmail: string | null;
  enabled: boolean;
}) {
  const { orgId, ...rest } = opts;
  try {
    return await prisma.trustProfile.upsert({
      where: { orgId },
      create: { orgId, ...rest },
      update: rest,
    });
  } catch (e: unknown) {
    // `slug` is unique across the whole table because it addresses a public
    // URL, so a collision is with some other tenant's profile. Report the
    // conflict without confirming which org holds it.
    if ((e as { code?: string })?.code === "P2002") {
      throw new TrustStateError("that URL identifier is already taken");
    }
    throw e;
  }
}

export async function createTrustDraft(opts: {
  db: OrgScopedClient;
  orgId: string;
  userId: string;
  usecaseIds: string[];
  generatedBy: { id: string; name: string };
}) {
  const profile = await prisma.trustProfile.findUnique({
    where: { orgId: opts.orgId },
  });
  if (!profile) {
    throw new TrustStateError("configure the trust profile before drafting");
  }
  const { publicPayload, confidentialPayload } = await buildTrustPayloads({
    db: opts.db,
    orgId: opts.orgId,
    usecaseIds: opts.usecaseIds,
    profile: {
      displayName: profile.displayName,
      intro: profile.intro,
      contactEmail: profile.contactEmail,
    },
    generatedBy: opts.generatedBy,
  });
  return prisma.trustSnapshot.create({
    data: {
      orgId: opts.orgId,
      createdById: opts.userId,
      includedUsecaseIds: opts.usecaseIds,
      publicPayload: JSON.parse(JSON.stringify(publicPayload)),
      confidentialPayload: JSON.parse(JSON.stringify(confidentialPayload)),
    },
  });
}

/**
 * One transaction: supersede the current publication, assign
 * `version = max + 1`, flip the draft to published. Two concurrent publishes
 * collide on `@@unique([orgId, version])` and exactly one survives.
 */
export async function publishTrustSnapshot(opts: {
  orgId: string;
  snapshotId: string;
  userId: string;
}) {
  const { orgId, snapshotId, userId } = opts;
  return prisma.$transaction(async (tx) => {
    const draft = await tx.trustSnapshot.findFirst({
      where: { id: snapshotId, orgId, status: "draft" },
    });
    if (!draft) throw new TrustStateError("snapshot is not a draft");

    const current = await tx.trustSnapshot.findFirst({
      where: { orgId, status: "published" },
    });
    const max = await tx.trustSnapshot.aggregate({
      where: { orgId },
      _max: { version: true },
    });

    if (current) {
      await tx.trustSnapshot.update({
        where: { id: current.id },
        data: { status: "superseded" },
      });
    }

    return tx.trustSnapshot.update({
      where: { id: draft.id },
      data: {
        status: "published",
        version: (max._max.version ?? 0) + 1,
        publishedAt: new Date(),
        publishedById: userId,
        supersededById: current?.id ?? null,
      },
    });
  });
}

/**
 * Withdrawal means "this should not have gone out": the version disappears
 * from every public route and the version it superseded comes back. If it
 * superseded nothing, the org is left with no published snapshot and all
 * public routes 404 — the correct outcome.
 */
export async function withdrawTrustSnapshot(opts: {
  orgId: string;
  snapshotId: string;
  userId: string;
}) {
  const { orgId, snapshotId, userId } = opts;
  return prisma.$transaction(async (tx) => {
    const row = await tx.trustSnapshot.findFirst({
      where: { id: snapshotId, orgId, status: "published" },
    });
    if (!row) throw new TrustStateError("snapshot is not published");

    const withdrawn = await tx.trustSnapshot.update({
      where: { id: row.id },
      data: {
        status: "withdrawn",
        withdrawnAt: new Date(),
        withdrawnById: userId,
        // Free the unique slot so a later publish can point at the restored prior.
        supersededById: null,
      },
    });

    if (row.supersededById) {
      await tx.trustSnapshot.update({
        where: { id: row.supersededById },
        data: { status: "published" },
      });
    }
    return withdrawn;
  });
}

/** Returns the deleted row so the caller can name it in the audit trail. */
export async function deleteTrustDraft(opts: {
  orgId: string;
  snapshotId: string;
}) {
  const row = await prisma.trustSnapshot.findFirst({
    where: { id: opts.snapshotId, orgId: opts.orgId },
  });
  if (!row) throw new TrustStateError("snapshot not found");
  if (row.status !== "draft") {
    throw new TrustStateError("only drafts can be deleted");
  }
  return prisma.trustSnapshot.delete({ where: { id: row.id } });
}
