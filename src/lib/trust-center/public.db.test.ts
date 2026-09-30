import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit/log";
import { generateTrustToken } from "./token";
import { getPublicView, getConfidentialView } from "./public";

async function scenario() {
  const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
  const org = await prisma.organization.create({
    data: { name: "TRUST-PUB-" + suffix },
  });
  const user = await prisma.user.create({
    data: { email: `trust-pub-${suffix}@example.com`, name: "Pub Tester" },
  });
  const slug = "pub-" + suffix.replace(/[^a-z0-9]/gi, "").slice(0, 20);
  await prisma.trustProfile.create({
    data: {
      orgId: org.id,
      slug,
      enabled: true,
      displayName: "Acme",
      intro: "hi",
      contactEmail: "trust@acme.example",
    },
  });
  const snapshot = await prisma.trustSnapshot.create({
    data: {
      orgId: org.id,
      createdById: user.id,
      status: "published",
      version: 1,
      publishedAt: new Date(),
      publishedById: user.id,
      includedUsecaseIds: [],
      publicPayload: { org: { displayName: "Acme" } },
      confidentialPayload: { secretMarker: "CONFIDENTIAL-ONLY" },
    },
  });
  const { raw, hash, prefix } = generateTrustToken();
  const token = await prisma.trustAccessToken.create({
    data: {
      orgId: org.id,
      tokenHash: hash,
      tokenPrefix: prefix,
      label: "Acme DD",
      createdById: user.id,
    },
  });
  return { org, user, slug, snapshot, token, raw };
}

beforeEach(() => {
  vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
});

describe("getPublicView", () => {
  it("returns the public payload of the newest published snapshot", async () => {
    const { slug } = await scenario();
    const view = await getPublicView(slug);
    expect(view?.version).toBe(1);
    expect(view?.displayName).toBe("Acme");
  });

  it("never returns confidential data — not even as an extra key", async () => {
    const { slug } = await scenario();
    const view = await getPublicView(slug);
    expect(JSON.stringify(view)).not.toContain("CONFIDENTIAL-ONLY");
    expect(JSON.stringify(view)).not.toContain("confidentialPayload");
  });

  it("returns null for an unknown slug", async () => {
    expect(await getPublicView("no-such-slug")).toBeNull();
  });

  it("returns null when the profile is disabled", async () => {
    const { org, slug } = await scenario();
    await prisma.trustProfile.update({
      where: { orgId: org.id },
      data: { enabled: false },
    });
    expect(await getPublicView(slug)).toBeNull();
  });

  it("returns null when the only publication has been withdrawn", async () => {
    const { slug, snapshot } = await scenario();
    await prisma.trustSnapshot.update({
      where: { id: snapshot.id },
      data: { status: "withdrawn", withdrawnAt: new Date() },
    });
    expect(await getPublicView(slug)).toBeNull();
  });
});

describe("getConfidentialView", () => {
  it("returns the confidential payload for a live token", async () => {
    const { slug, token } = await scenario();
    const view = await getConfidentialView({ slug, tokenId: token.id });
    expect(JSON.stringify(view?.confidentialPayload)).toContain(
      "CONFIDENTIAL-ONLY",
    );
    expect(view?.versions).toEqual([1]);
  });

  it("writes an actorless trust.access audit entry", async () => {
    const spy = vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
    const { slug, token, org } = await scenario();
    await getConfidentialView({
      slug,
      tokenId: token.id,
      ip: "203.0.113.4",
      userAgent: "probe/1.0",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: org.id,
        action: "trust.access",
        resourceType: "trust_snapshot",
        ip: "203.0.113.4",
      }),
    );
    const call = spy.mock.calls.at(-1)![0];
    expect(call.actorId).toBeUndefined();
  });

  it("returns null once the token is revoked", async () => {
    const { slug, token } = await scenario();
    await prisma.trustAccessToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });
    expect(await getConfidentialView({ slug, tokenId: token.id })).toBeNull();
  });

  it("returns null when the token belongs to a different org", async () => {
    const a = await scenario();
    const b = await scenario();
    expect(
      await getConfidentialView({ slug: a.slug, tokenId: b.token.id }),
    ).toBeNull();
  });

  it("returns null for a version that does not exist", async () => {
    const { slug, token } = await scenario();
    expect(
      await getConfidentialView({ slug, tokenId: token.id, version: 99 }),
    ).toBeNull();
  });

  it("serves a superseded version by number but never a withdrawn one", async () => {
    const { slug, token, org, user, snapshot } = await scenario();
    await prisma.trustSnapshot.update({
      where: { id: snapshot.id },
      data: { status: "superseded" },
    });
    const v2 = await prisma.trustSnapshot.create({
      data: {
        orgId: org.id,
        createdById: user.id,
        status: "published",
        version: 2,
        publishedAt: new Date(),
        publishedById: user.id,
        includedUsecaseIds: [],
        publicPayload: {},
        confidentialPayload: { secretMarker: "V2" },
      },
    });
    expect(
      await getConfidentialView({ slug, tokenId: token.id, version: 1 }),
    ).not.toBeNull();
    await prisma.trustSnapshot.update({
      where: { id: v2.id },
      data: { status: "withdrawn", withdrawnAt: new Date() },
    });
    expect(
      await getConfidentialView({ slug, tokenId: token.id, version: 2 }),
    ).toBeNull();
  });

  it("bumps useCount on a successful read", async () => {
    const { slug, token } = await scenario();
    await getConfidentialView({ slug, tokenId: token.id });
    const after = await prisma.trustAccessToken.findUnique({
      where: { id: token.id },
    });
    expect(after?.useCount).toBe(1);
  });
});
