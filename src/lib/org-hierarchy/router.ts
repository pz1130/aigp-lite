import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";

/**
 * HQ-admin self-service for the two-level org tree. All procedures are gated on
 * `org.write` (admin only). Cross-org writes use the raw `prisma` client
 * because `Organization` is not org-scoped and this is the parent admin acting
 * on a child's `parentOrgId` under authority.
 */
export const orgHierarchyRouter = router({
  listChildren: orgProcedure.query(async ({ ctx }) => {
    assertPermission(ctx.session.role, "org.write");
    const self = await prisma.organization.findUnique({
      where: { id: ctx.session.orgId },
      select: {
        id: true,
        name: true,
        parentOrgId: true,
        children: {
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!self) throw new TRPCError({ code: "NOT_FOUND" });
    return {
      orgId: self.id,
      name: self.name,
      parentOrgId: self.parentOrgId,
      children: self.children,
    };
  }),

  attachChild: orgProcedure
    .input(z.object({ childOrgId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");
      const callerOrgId = ctx.session.orgId;

      // Invariant 1: cannot attach self.
      if (input.childOrgId === callerOrgId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "CONFLICT: cannot attach an organization to itself.",
        });
      }

      // Invariant 2: the caller (would-be parent) must not itself be a child.
      const self = await prisma.organization.findUnique({
        where: { id: callerOrgId },
        select: { parentOrgId: true },
      });
      if (!self) throw new TRPCError({ code: "NOT_FOUND" });
      if (self.parentOrgId) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "CONFLICT: this organization is already a child; the tree is two levels deep.",
        });
      }

      // Child must exist; load its parent + child-count for the remaining checks.
      const child = await prisma.organization.findUnique({
        where: { id: input.childOrgId },
        select: {
          id: true,
          parentOrgId: true,
          _count: { select: { children: true } },
        },
      });
      if (!child) throw new TRPCError({ code: "NOT_FOUND" });

      // Invariant 3: the child must not itself be a parent.
      if (child._count.children > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "CONFLICT: that organization already has children and cannot become a child.",
        });
      }

      // Invariant 4: the child must be unparented, or already parented to us.
      if (child.parentOrgId && child.parentOrgId !== callerOrgId) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "CONFLICT: that organization already belongs to another parent.",
        });
      }

      // Re-verify the child-side invariants (unparented-or-ours, childless)
      // atomically in the WHERE clause of the write itself, closing the
      // check-then-act race between the reads above and this update — e.g.
      // two admins concurrently attaching the same child, or the child
      // concurrently gaining a child of its own (which would else produce a
      // three-level chain).
      const { count } = await prisma.organization.updateMany({
        where: {
          id: input.childOrgId,
          OR: [{ parentOrgId: null }, { parentOrgId: callerOrgId }],
          children: { none: {} },
        },
        data: { parentOrgId: callerOrgId },
      });
      if (count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "CONFLICT: hierarchy changed concurrently; please retry.",
        });
      }
      await writeAudit({
        orgId: callerOrgId,
        actorId: ctx.session.userId,
        action: "org.hierarchy.attach",
        resourceType: "organization",
        resourceId: input.childOrgId,
        after: { parentOrgId: callerOrgId },
      });
      return { ok: true as const };
    }),

  detachChild: orgProcedure
    .input(z.object({ childOrgId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "org.write");
      const callerOrgId = ctx.session.orgId;
      const child = await prisma.organization.findUnique({
        where: { id: input.childOrgId },
        select: { parentOrgId: true },
      });
      if (!child) throw new TRPCError({ code: "NOT_FOUND" });
      if (child.parentOrgId !== callerOrgId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "CONFLICT: that organization is not a child of yours.",
        });
      }
      await prisma.organization.update({
        where: { id: input.childOrgId },
        data: { parentOrgId: null },
      });
      await writeAudit({
        orgId: callerOrgId,
        actorId: ctx.session.userId,
        action: "org.hierarchy.detach",
        resourceType: "organization",
        resourceId: input.childOrgId,
        after: { parentOrgId: null },
      });
      return { ok: true as const };
    }),
});
