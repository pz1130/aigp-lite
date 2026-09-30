import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db";
import {
  startWorkflow,
  getWorkflowInstance,
  decideStep,
  canUserDecide,
} from "@/lib/workflow/engine";

const stepDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "requested_changes"]),
  comment: z.string().optional(),
});

export const workflowRouter = router({
  // --- Templates ---

  listTemplates: orgProcedure.query(async ({ ctx }) => {
    return prisma.workflowTemplate.findMany({
      where: { orgId: ctx.session.orgId },
      include: {
        steps: { orderBy: { stepIndex: "asc" } },
        _count: { select: { steps: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getTemplate: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const t = await prisma.workflowTemplate.findUnique({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: { steps: { orderBy: { stepIndex: "asc" } } },
      });
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      return t;
    }),

  createTemplate: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().max(500).default(""),
        isDefault: z.boolean().default(false),
        steps: z
          .array(
            z.object({
              stepIndex: z.number().int().min(0),
              stepName: z.string().min(1).max(80),
              assigneeRole: z.string().optional(),
              assigneeUserId: z.string().optional(),
              instructions: z.string().max(500).optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "workflow.write");
      if (input.isDefault) {
        await prisma.workflowTemplate.updateMany({
          where: { orgId: ctx.session.orgId },
          data: { isDefault: false },
        });
      }
      return prisma.workflowTemplate.create({
        data: {
          orgId: ctx.session.orgId,
          name: input.name,
          description: input.description,
          isDefault: input.isDefault,
          createdBy: ctx.session.userId,
          steps: { create: input.steps },
        },
        include: { steps: { orderBy: { stepIndex: "asc" } } },
      });
    }),

  updateTemplate: orgProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(500).optional(),
        isDefault: z.boolean().optional(),
        steps: z
          .array(
            z.object({
              stepIndex: z.number().int().min(0),
              stepName: z.string().min(1).max(80),
              assigneeRole: z.string().optional(),
              assigneeUserId: z.string().optional(),
              instructions: z.string().max(500).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "workflow.write");
      const existing = await prisma.workflowTemplate.findUnique({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.isDefault) {
        await prisma.workflowTemplate.updateMany({
          where: { orgId: ctx.session.orgId, id: { not: input.id } },
          data: { isDefault: false },
        });
      }

      const { steps, ...data } = input;
      const updated = await prisma.workflowTemplate.update({
        where: { id: input.id },
        data: {
          ...data,
          steps: steps
            ? {
                deleteMany: { templateId: input.id },
                create: steps,
              }
            : undefined,
        },
        include: { steps: { orderBy: { stepIndex: "asc" } } },
      });
      return updated;
    }),

  deleteTemplate: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "workflow.delete");
      const existing = await prisma.workflowTemplate.findUnique({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await prisma.workflowTemplate.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  // --- Instances ---

  // Count of open workflows for the org
  pendingCount: orgProcedure.query(({ ctx }) =>
    ctx.db.workflowInstance.count({
      where: { orgId: ctx.session.orgId, state: "open" },
    }),
  ),

  // Start a promotion workflow for a usecase
  start: orgProcedure
    .input(
      z.object({
        usecaseId: z.string(),
        templateId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "workflow.write");
      const instance = await startWorkflow(
        ctx.session.orgId,
        input.usecaseId,
        input.templateId,
        ctx.session.userId,
      );
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "workflow.start",
        resourceType: "workflow_instance",
        resourceId: instance.id,
        after: { usecaseId: input.usecaseId, templateId: input.templateId },
        ip: ctx.ip,
      });
      return instance;
    }),

  // Get a workflow instance by ID
  get: orgProcedure
    .input(z.object({ instanceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const instance = await getWorkflowInstance(input.instanceId);
      if (!instance || instance.orgId !== ctx.session.orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return instance;
    }),

  // List open workflows for the org
  list: orgProcedure.query(async ({ ctx }) => {
    return ctx.db.workflowInstance.findMany({
      where: { orgId: ctx.session.orgId, state: "open" },
      orderBy: { createdAt: "desc" },
      include: {
        steps: { orderBy: { stepIndex: "asc" } },
        usecase: { select: { id: true, name: true } },
      },
    });
  }),

  // Decide a step
  decideStep: orgProcedure
    .input(
      z.object({
        instanceId: z.string(),
        stepIndex: z.number(),
        decision: stepDecisionSchema.shape.decision,
        comment: stepDecisionSchema.shape.comment,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "workflow.write");
      const instance = await getWorkflowInstance(input.instanceId);
      if (!instance || instance.orgId !== ctx.session.orgId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const step = instance.steps.find(
        (s: { stepIndex: number }) => s.stepIndex === input.stepIndex,
      );
      if (!step)
        throw new TRPCError({ code: "NOT_FOUND", message: "Step not found" });

      // Check user can decide: admin OR specific assigneeUserId OR assigneeRole
      const canDecide = await canUserDecide(
        input.instanceId,
        ctx.session.userId,
        ctx.session.role,
      );
      if (!canDecide) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const updated = await decideStep(
        input.instanceId,
        input.stepIndex,
        input.decision,
        ctx.session.userId,
        input.comment,
      );
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: `workflow.step.${input.decision}`,
        resourceType: "workflow_step",
        resourceId: `${input.instanceId}:${input.stepIndex}`,
        after: { decision: input.decision, comment: input.comment },
        ip: ctx.ip,
      });
      return updated;
    }),
});
