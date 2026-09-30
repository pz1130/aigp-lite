import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";

let orgId: string;
let otherOrgId: string;
let userId: string;
let otherUserId: string;

function makeCtx(uid: string, oid: string): TRPCContext {
  return {
    session: {
      userId: uid,
      orgId: oid,
      role: "admin",
      email: `${uid}@x`,
    },
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `R ${Date.now()}` },
  });
  orgId = org.id;
  const o2 = await prisma.organization.create({
    data: { name: `R2 ${Date.now()}` },
  });
  otherOrgId = o2.id;
  userId = (
    await prisma.user.create({
      data: { email: `u-${Date.now()}@x`, name: "U", passwordHash: "x" },
    })
  ).id;
  otherUserId = (
    await prisma.user.create({
      data: { email: `u2-${Date.now()}@x`, name: "U2", passwordHash: "x" },
    })
  ).id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId, role: "admin" },
      { orgId: otherOrgId, userId: otherUserId, role: "admin" },
    ],
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.membership.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgId, otherOrgId] } },
  });
});

beforeEach(async () => {
  await prisma.notification.deleteMany({
    where: { orgId: { in: [orgId, otherOrgId] } },
  });
});

async function seedN(
  n: number,
  opts: { read?: boolean; recipientUserId?: string; org?: string } = {},
) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await prisma.notification.create({
      data: {
        orgId: opts.org ?? orgId,
        recipientUserId: opts.recipientUserId ?? userId,
        type: "step_assigned",
        titleKey: "stepAssigned.title",
        bodyKey: "stepAssigned.body",
        paramsJson: { usecaseName: `u${i}`, stepName: "s" },
        linkHref: "/workflow/x",
        readAt: opts.read ? new Date() : null,
      },
    });
    ids.push(r.id);
    await new Promise((r) => setTimeout(r, 2));
  }
  return ids;
}

describe("notification router", () => {
  it("list returns own org+user only, newest first", async () => {
    await seedN(3);
    await seedN(2, { org: otherOrgId, recipientUserId: otherUserId });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const r = await caller.notification.list({});
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBeNull();
  });

  it("list unreadOnly filters out read", async () => {
    await seedN(2, { read: true });
    await seedN(1);
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(
      (await caller.notification.list({ unreadOnly: true })).items,
    ).toHaveLength(1);
    expect(
      (await caller.notification.list({ unreadOnly: false })).items,
    ).toHaveLength(3);
  });

  it("list paginates with cursor", async () => {
    await seedN(5);
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const page1 = await caller.notification.list({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await caller.notification.list({
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].id).not.toBe(page1.items[1].id);
  });

  it("unreadCount counts unread only for me", async () => {
    await seedN(2);
    await seedN(1, { read: true });
    await seedN(5, { org: otherOrgId, recipientUserId: otherUserId });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(await caller.notification.unreadCount()).toBe(2);
  });

  it("markRead marks own row", async () => {
    const [id] = await seedN(1);
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.notification.markRead({ id });
    const row = await prisma.notification.findUnique({ where: { id } });
    expect(row?.readAt).not.toBeNull();
  });

  it("markRead cannot touch another user's row", async () => {
    const [id] = await seedN(1, {
      org: otherOrgId,
      recipientUserId: otherUserId,
    });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.notification.markRead({ id });
    const row = await prisma.notification.findUnique({ where: { id } });
    expect(row?.readAt).toBeNull();
  });

  it("markAllRead returns count and clears unread for me only", async () => {
    await seedN(3);
    await seedN(2, { org: otherOrgId, recipientUserId: otherUserId });
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    expect(await caller.notification.markAllRead()).toEqual({ count: 3 });
    expect(await caller.notification.unreadCount()).toBe(0);
    expect(
      await prisma.notification.count({
        where: { orgId: otherOrgId, readAt: null },
      }),
    ).toBe(2);
  });
});
