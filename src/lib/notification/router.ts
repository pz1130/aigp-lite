import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const notificationRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.string().optional(),
        })
        // v4: .default() no longer re-parses, so an object default must supply
        // every output field. .prefault({}) keeps the old behavior — the {} is
        // parsed through the schema so the inner field defaults still apply.
        .prefault({}),
    )
    .query(async ({ ctx, input }) => {
      const items = await prisma.notification.findMany({
        where: {
          orgId: ctx.session.orgId,
          recipientUserId: ctx.session.userId,
          ...(input.unreadOnly ? { readAt: null } : {}),
        },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
      });
      const hasMore = items.length > input.limit;
      const sliced = items.slice(0, input.limit);
      return {
        items: sliced,
        nextCursor: hasMore ? sliced[sliced.length - 1].id : null,
      };
    }),

  unreadCount: orgProcedure.query(({ ctx }) =>
    prisma.notification.count({
      where: {
        orgId: ctx.session.orgId,
        recipientUserId: ctx.session.userId,
        readAt: null,
      },
    }),
  ),

  markRead: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.notification.updateMany({
        where: {
          id: input.id,
          recipientUserId: ctx.session.userId,
          orgId: ctx.session.orgId,
        },
        data: { readAt: new Date() },
      });
      return { ok: true as const };
    }),

  markAllRead: orgProcedure.mutation(async ({ ctx }) => {
    const r = await prisma.notification.updateMany({
      where: {
        recipientUserId: ctx.session.userId,
        orgId: ctx.session.orgId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { count: r.count };
  }),
});
