import { router, publicProcedure } from "./server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit/log";
import { TRPCError } from "@trpc/server";
import { inventoryRouter } from "@/lib/inventory/router";
import { riskRouter } from "@/lib/risk/router";
import { governanceRouter } from "@/lib/governance/router";
import { workflowRouter } from "@/lib/workflow/router";
import { evidenceRouter } from "@/lib/evidence/router";
import { auditRouter } from "@/lib/audit/router";
import { auditSinkRouter } from "@/lib/audit/sink-router";
import { reportsRouter } from "@/lib/reports/router";
import { friaRouter } from "@/lib/fria/router";
import { notificationRouter } from "@/lib/notification/router";
import { membersRouter } from "@/lib/members/router";
import { ssoRouter } from "@/lib/auth/sso/router";
import { materialityRouter } from "@/lib/materiality/router";
import { fairnessRouter } from "@/lib/fairness/router";
import { vendorRouter } from "@/lib/vendor/router";
import { dossierRouter } from "@/lib/dossier/router";
import { trustCenterRouter } from "@/lib/trust-center/router";

const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
  orgName: z.string().min(1).max(80),
});

const auth = router({
  register: publicProcedure
    .input(registerInput)
    .mutation(async ({ input, ctx }) => {
      const email = input.email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "email already registered",
        });

      const passwordHash = await hashPassword(input.password);

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: input.orgName },
        });
        const user = await tx.user.create({
          data: { email, name: input.name, passwordHash },
        });
        await tx.membership.create({
          data: { orgId: org.id, userId: user.id, role: "admin" },
        });
        return { org, user };
      });

      await writeAudit({
        orgId: result.org.id,
        actorId: result.user.id,
        action: "org.create",
        resourceType: "organization",
        resourceId: result.org.id,
        after: { name: result.org.name },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return {
        ok: true as const,
        orgId: result.org.id,
        userId: result.user.id,
      };
    }),
});

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, ts: Date.now() })),
  auth,
  inventory: inventoryRouter,
  risk: riskRouter,
  governance: governanceRouter,
  workflow: workflowRouter,
  evidence: evidenceRouter,
  audit: auditRouter,
  auditSink: auditSinkRouter,
  reports: reportsRouter,
  fria: friaRouter,
  notification: notificationRouter,
  members: membersRouter,
  sso: ssoRouter,
  materiality: materialityRouter,
  fairness: fairnessRouter,
  vendor: vendorRouter,
  dossier: dossierRouter,
  trustCenter: trustCenterRouter,
});
export type AppRouter = typeof appRouter;
