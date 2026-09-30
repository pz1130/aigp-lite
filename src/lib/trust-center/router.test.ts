import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import * as audit from "@/lib/audit/log";
import { trustCenterRouter } from "./router";

async function ctxFor(role: "admin" | "ai_owner" | "viewer") {
  const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
  const org = await prisma.organization.create({
    data: { name: "TRUST-RTR-" + suffix },
  });
  const user = await prisma.user.create({
    data: { email: `trust-rtr-${suffix}@example.com`, name: "Rtr Tester" },
  });
  return {
    ctx: {
      session: {
        orgId: org.id,
        userId: user.id,
        role,
        email: `trust-rtr-${suffix}@example.com`,
      },
      ip: "203.0.113.9",
      userAgent: "vitest",
    },
    org,
    user,
    suffix,
  };
}

beforeEach(() => {
  vi.spyOn(audit, "writeAudit").mockResolvedValue(undefined);
});

describe("trustCenterRouter.saveProfile", () => {
  it("upserts the profile for a writer", async () => {
    const { ctx, suffix } = await ctxFor("admin");
    const caller = trustCenterRouter.createCaller(ctx);
    const saved = await caller.saveProfile({
      slug: "rtr" + suffix.replace(/[^a-z0-9]/gi, "").slice(0, 16),
      displayName: "Acme",
      intro: "",
      contactEmail: null,
      enabled: true,
    });
    expect(saved.displayName).toBe("Acme");
  });

  it("rejects a viewer", async () => {
    const { ctx, suffix } = await ctxFor("viewer");
    const caller = trustCenterRouter.createCaller(ctx);
    await expect(
      caller.saveProfile({
        slug: "rtr" + suffix.replace(/[^a-z0-9]/gi, "").slice(0, 16),
        displayName: "Acme",
        intro: "",
        contactEmail: null,
        enabled: true,
      }),
    ).rejects.toThrow();
  });

  it("turns a slug taken by another org into BAD_REQUEST, not a 500", async () => {
    const first = await ctxFor("admin");
    const second = await ctxFor("admin");
    const slug = "rtr" + first.suffix.replace(/[^a-z0-9]/gi, "").slice(0, 16);
    const profile = {
      slug,
      displayName: "Acme",
      intro: "",
      contactEmail: null,
      enabled: true,
    };
    await trustCenterRouter.createCaller(first.ctx).saveProfile(profile);
    await expect(
      trustCenterRouter.createCaller(second.ctx).saveProfile(profile),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("trustCenterRouter.deleteDraft", () => {
  it("audits the deletion", async () => {
    const { ctx, org, user } = await ctxFor("admin");
    const draft = await prisma.trustSnapshot.create({
      data: {
        orgId: org.id,
        createdById: user.id,
        includedUsecaseIds: [],
        publicPayload: {},
        confidentialPayload: {},
      },
    });
    await trustCenterRouter.createCaller(ctx).deleteDraft({ id: draft.id });
    expect(audit.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: org.id,
        actorId: user.id,
        action: "trust.snapshot.delete",
        resourceId: draft.id,
      }),
    );
  });
});

describe("trustCenterRouter.issueToken", () => {
  it("returns the raw token exactly once and stores only its hash", async () => {
    const { ctx, org } = await ctxFor("admin");
    const caller = trustCenterRouter.createCaller(ctx);
    const { raw, token } = await caller.issueToken({
      label: "Acme DD",
      recipientEmail: null,
      expiresAt: null,
    });
    expect(raw.startsWith("aigp_trust_")).toBe(true);
    const row = await prisma.trustAccessToken.findUnique({
      where: { id: token.id },
    });
    expect(row?.orgId).toBe(org.id);
    expect(JSON.stringify(row)).not.toContain(raw);

    const listed = await caller.listTokens();
    expect(JSON.stringify(listed)).not.toContain(raw);
  });

  it("rejects ai_owner — issuing a token is an approve-level act", async () => {
    const { ctx } = await ctxFor("ai_owner");
    const caller = trustCenterRouter.createCaller(ctx);
    await expect(
      caller.issueToken({ label: "x", recipientEmail: null, expiresAt: null }),
    ).rejects.toThrow();
  });
});

describe("trustCenterRouter.revokeToken", () => {
  it("stamps revokedAt and revokedById", async () => {
    const { ctx, user } = await ctxFor("admin");
    const caller = trustCenterRouter.createCaller(ctx);
    const { token } = await caller.issueToken({
      label: "Acme DD",
      recipientEmail: null,
      expiresAt: null,
    });
    const revoked = await caller.revokeToken({ id: token.id });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedById).toBe(user.id);
  });
});

describe("trustCenterRouter.publish", () => {
  it("rejects ai_owner and accepts admin", async () => {
    const { ctx: ownerCtx, org, user } = await ctxFor("ai_owner");
    const draft = await prisma.trustSnapshot.create({
      data: {
        orgId: org.id,
        createdById: user.id,
        includedUsecaseIds: [],
        publicPayload: {},
        confidentialPayload: {},
      },
    });
    await expect(
      trustCenterRouter.createCaller(ownerCtx).publish({ id: draft.id }),
    ).rejects.toThrow();

    const adminCtx = {
      ...ownerCtx,
      session: { ...ownerCtx.session, role: "admin" as const },
    };
    const published = await trustCenterRouter
      .createCaller(adminCtx)
      .publish({ id: draft.id });
    expect(published.version).toBe(1);
  });
});
