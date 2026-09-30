import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  saveTrustProfile,
  publishTrustSnapshot,
  withdrawTrustSnapshot,
  deleteTrustDraft,
  isTrustSnapshotStale,
  TrustStateError,
} from "./service";

async function fixture() {
  const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
  const org = await prisma.organization.create({
    data: { name: "TRUST-SVC-" + suffix },
  });
  const user = await prisma.user.create({
    data: { email: `trust-svc-${suffix}@example.com`, name: "Svc Tester" },
  });
  return { org, user };
}

async function makeDraft(orgId: string, userId: string) {
  return prisma.trustSnapshot.create({
    data: {
      orgId,
      createdById: userId,
      includedUsecaseIds: [],
      publicPayload: {},
      confidentialPayload: {},
    },
  });
}

describe("saveTrustProfile", () => {
  it("creates then updates the single row per org", async () => {
    const { org } = await fixture();
    const slug = "acme-" + Math.random().toString(36).slice(2, 8);
    const created = await saveTrustProfile({
      orgId: org.id,
      slug,
      displayName: "Acme",
      intro: "",
      contactEmail: null,
      enabled: false,
    });
    const updated = await saveTrustProfile({
      orgId: org.id,
      slug,
      displayName: "Acme Corp",
      intro: "hi",
      contactEmail: "trust@acme.example",
      enabled: true,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.displayName).toBe("Acme Corp");
    expect(updated.enabled).toBe(true);
  });

  it("reports a slug already taken by another org as a state error", async () => {
    const first = await fixture();
    const second = await fixture();
    const slug = "taken-" + Math.random().toString(36).slice(2, 8);
    await saveTrustProfile({
      orgId: first.org.id,
      slug,
      displayName: "First",
      intro: "",
      contactEmail: null,
      enabled: true,
    });
    await expect(
      saveTrustProfile({
        orgId: second.org.id,
        slug,
        displayName: "Second",
        intro: "",
        contactEmail: null,
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(TrustStateError);
  });
});

describe("publishTrustSnapshot", () => {
  it("assigns version 1 to the first publication", async () => {
    const { org, user } = await fixture();
    const draft = await makeDraft(org.id, user.id);
    const published = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: draft.id,
      userId: user.id,
    });
    expect(published.version).toBe(1);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
    expect(published.supersededById).toBeNull();
  });

  it("supersedes the previous publication and increments the version", async () => {
    const { org, user } = await fixture();
    const v1 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    const v2 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    expect(v2.version).toBe(2);
    expect(v2.supersededById).toBe(v1.id);
    const reloadedV1 = await prisma.trustSnapshot.findUnique({
      where: { id: v1.id },
    });
    expect(reloadedV1?.status).toBe("superseded");
  });

  it("refuses to publish a row that is not a draft", async () => {
    const { org, user } = await fixture();
    const draft = await makeDraft(org.id, user.id);
    await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: draft.id,
      userId: user.id,
    });
    await expect(
      publishTrustSnapshot({
        orgId: org.id,
        snapshotId: draft.id,
        userId: user.id,
      }),
    ).rejects.toBeInstanceOf(TrustStateError);
  });

  it("lets only one of two concurrent publishes win", async () => {
    const { org, user } = await fixture();
    const a = await makeDraft(org.id, user.id);
    const b = await makeDraft(org.id, user.id);
    const results = await Promise.allSettled([
      publishTrustSnapshot({
        orgId: org.id,
        snapshotId: a.id,
        userId: user.id,
      }),
      publishTrustSnapshot({
        orgId: org.id,
        snapshotId: b.id,
        userId: user.id,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const published = await prisma.trustSnapshot.findMany({
      where: { orgId: org.id, status: "published" },
    });
    expect(published).toHaveLength(1);
  });

  it("keeps multiple unpublished drafts coexisting (version stays NULL)", async () => {
    const { org, user } = await fixture();
    const d1 = await makeDraft(org.id, user.id);
    const d2 = await makeDraft(org.id, user.id);
    expect(d1.version).toBeNull();
    expect(d2.version).toBeNull();
  });
});

describe("withdrawTrustSnapshot", () => {
  it("restores the version it superseded to published", async () => {
    const { org, user } = await fixture();
    const v1 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    const v2 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    const withdrawn = await withdrawTrustSnapshot({
      orgId: org.id,
      snapshotId: v2.id,
      userId: user.id,
    });
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.withdrawnAt).not.toBeNull();
    const reloadedV1 = await prisma.trustSnapshot.findUnique({
      where: { id: v1.id },
    });
    expect(reloadedV1?.status).toBe("published");
  });

  it("leaves the org with no published snapshot when v1 is withdrawn", async () => {
    const { org, user } = await fixture();
    const v1 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    await withdrawTrustSnapshot({
      orgId: org.id,
      snapshotId: v1.id,
      userId: user.id,
    });
    const published = await prisma.trustSnapshot.findMany({
      where: { orgId: org.id, status: "published" },
    });
    expect(published).toHaveLength(0);
  });

  it("refuses to withdraw a snapshot that is not published", async () => {
    const { org, user } = await fixture();
    const draft = await makeDraft(org.id, user.id);
    await expect(
      withdrawTrustSnapshot({
        orgId: org.id,
        snapshotId: draft.id,
        userId: user.id,
      }),
    ).rejects.toBeInstanceOf(TrustStateError);
  });

  it("allows re-publish after withdraw (clears supersededById uniqueness)", async () => {
    const { org, user } = await fixture();
    const v1 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    const v2 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    await withdrawTrustSnapshot({
      orgId: org.id,
      snapshotId: v2.id,
      userId: user.id,
    });
    const v3 = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    expect(v3.status).toBe("published");
    expect(v3.version).toBe(3);
    expect(v3.supersededById).toBe(v1.id);
    const published = await prisma.trustSnapshot.findMany({
      where: { orgId: org.id, status: "published" },
    });
    expect(published).toHaveLength(1);
    expect(published[0].id).toBe(v3.id);
    const reloadedV2 = await prisma.trustSnapshot.findUnique({
      where: { id: v2.id },
    });
    expect(reloadedV2?.status).toBe("withdrawn");
    expect(reloadedV2?.supersededById).toBeNull();
  });
});

describe("deleteTrustDraft", () => {
  it("deletes a draft but refuses a published snapshot", async () => {
    const { org, user } = await fixture();
    const draft = await makeDraft(org.id, user.id);
    const deleted = await deleteTrustDraft({
      orgId: org.id,
      snapshotId: draft.id,
    });
    // Returned so the caller can name the row it destroyed in the audit trail.
    expect(deleted.id).toBe(draft.id);
    expect(
      await prisma.trustSnapshot.findUnique({ where: { id: draft.id } }),
    ).toBeNull();

    const published = await publishTrustSnapshot({
      orgId: org.id,
      snapshotId: (await makeDraft(org.id, user.id)).id,
      userId: user.id,
    });
    await expect(
      deleteTrustDraft({ orgId: org.id, snapshotId: published.id }),
    ).rejects.toBeInstanceOf(TrustStateError);
  });
});

describe("isTrustSnapshotStale", () => {
  it("is true past 90 days, false before, and true when nothing is published", () => {
    const now = new Date("2026-08-14T00:00:00.000Z");
    expect(
      isTrustSnapshotStale(new Date("2026-08-01T00:00:00.000Z"), now),
    ).toBe(false);
    expect(
      isTrustSnapshotStale(new Date("2026-01-01T00:00:00.000Z"), now),
    ).toBe(true);
    expect(isTrustSnapshotStale(null, now)).toBe(true);
  });
});
