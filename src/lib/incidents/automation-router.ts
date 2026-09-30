import { z } from "zod";
import { router, orgProcedure } from "@/lib/trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { getOrgAutomationConfig } from "./automation-config";

const updateSchema = z.object({
  autoOpenEnabled: z.boolean().optional(),
  blockAlwaysOpens: z.boolean().optional(),
  hitBurstThreshold: z.number().int().min(1).max(1000).optional(),
  hitBurstWindowMin: z.number().int().min(1).max(1440).optional(),
  dedupEnabled: z.boolean().optional(),
  dedupSimilarityThreshold: z.number().min(0.5).max(0.99).optional(),
  dedupLookbackDays: z.number().int().min(1).max(365).optional(),
});

export const incidentAutomationRouter = router({
  get: orgProcedure.query(async ({ ctx }) => {
    return getOrgAutomationConfig(ctx.session.orgId);
  }),
  update: orgProcedure.input(updateSchema).mutation(async ({ ctx, input }) => {
    assertPermission(ctx.session.role, "org.write");
    const before = await getOrgAutomationConfig(ctx.session.orgId);
    const after = await ctx.db.orgIncidentAutomationConfig.update({
      where: { orgId: ctx.session.orgId },
      data: { ...input, updatedById: ctx.session.userId },
    });
    await writeAudit({
      orgId: ctx.session.orgId,
      actorId: ctx.session.userId,
      action: "incident.automation_config_changed",
      resourceType: "org_incident_automation_config",
      resourceId: ctx.session.orgId,
      before,
      after,
      ip: ctx.ip,
    });
    return after;
  }),
});
