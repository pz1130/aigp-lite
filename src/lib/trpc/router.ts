import { router, publicProcedure } from "./server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit/log";
import { TRPCError } from "@trpc/server";
import { inventoryRouter } from "@/lib/inventory/router";
import { riskRouter } from "@/lib/risk/router";
import { maturityRouter } from "@/lib/maturity/router";
import { governanceRouter } from "@/lib/governance/router";
import { policyRouter } from "@/lib/policy/router";
import { workflowRouter } from "@/lib/workflow/router";
import { evidenceRouter } from "@/lib/evidence/router";
import { auditRouter } from "@/lib/audit/router";
import { auditSinkRouter } from "@/lib/audit/sink-router";
import { dataLineageRouter } from "@/lib/data-lineage/router";
import { finopsRouter } from "@/lib/finops/router";
import { integrationsExtRouter } from "@/lib/integrations-ext/router";
import { integrationsRouter } from "@/lib/integrations/router";
import { redteamRouter } from "@/lib/redteam/router";
import { redteamAttestationRouter } from "@/lib/redteam/attestation-router";
import { incidentRouter } from "@/lib/incident/router";
import { connectionRouter } from "@/lib/runtime/connection-router";
import { reportsRouter } from "@/lib/reports/router";
import { friaRouter } from "@/lib/fria/router";
import { aivtfRouter } from "@/lib/aivtf/router";
import { mfChecklistRouter } from "@/lib/mf-checklist/router";
import { asiRedteamChecklistRouter } from "@/lib/asi-redteam-checklist/router";
import { agenticGovernanceRouter } from "@/lib/agentic-governance/router";
import { frontierRiskTierRouter } from "@/lib/frontier-risk-tier/router";
import { transparencyReportRouter } from "@/lib/transparency-report/router";
import { notificationRouter } from "@/lib/notification/router";
import { policyAssistantRouter } from "@/lib/policy-assistant/router";
import { mcpRouter } from "@/lib/mcp/router";
import { driftRouter } from "@/lib/drift/router";
import { riskCopilotRouter } from "@/lib/risk-copilot/router";
import { incidentRcaRouter } from "@/lib/incident-rca/router";
import { membersRouter } from "@/lib/members/router";
import { incidentAutomationRouter } from "@/lib/incidents/automation-router";
import { ssoRouter } from "@/lib/auth/sso/router";
import { evidencePackRouter } from "@/lib/evidence-pack/router";
import { materialityRouter } from "@/lib/materiality/router";
import { fairnessRouter } from "@/lib/fairness/router";
import { vendorRouter } from "@/lib/vendor/router";
import { dossierRouter } from "@/lib/dossier/router";
import { incidentTrendsRouter } from "@/lib/incident-trends/router";
import { orgHierarchyRouter } from "@/lib/org-hierarchy/router";
import { scimRouter } from "@/lib/scim/router";
import { externalReportsRouter } from "@/lib/external-reports/router";
import { alignmentAuditRouter } from "@/lib/alignment-audit/router";
import { usageInsightsRouter } from "@/lib/usage-insights/router";
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
        await tx.orgIncidentAutomationConfig.upsert({
          where: { orgId: org.id },
          create: { orgId: org.id },
          update: {},
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
  maturity: maturityRouter,
  governance: governanceRouter,
  policy: policyRouter,
  workflow: workflowRouter,
  evidence: evidenceRouter,
  audit: auditRouter,
  auditSink: auditSinkRouter,
  dataLineage: dataLineageRouter,
  integrations: integrationsRouter,
  integrationsExt: integrationsExtRouter,
  redteam: redteamRouter,
  redteamAttestation: redteamAttestationRouter,
  incident: incidentRouter,
  incidentRca: incidentRcaRouter,
  providerConnection: connectionRouter,
  reports: reportsRouter,
  fria: friaRouter,
  aivtf: aivtfRouter,
  mindforgeChecklist: mfChecklistRouter,
  asiRedteamChecklist: asiRedteamChecklistRouter,
  agenticGovernance: agenticGovernanceRouter,
  frontierRiskTier: frontierRiskTierRouter,
  transparencyReport: transparencyReportRouter,
  notification: notificationRouter,
  policyAssistant: policyAssistantRouter,
  riskCopilot: riskCopilotRouter,
  finops: finopsRouter,
  mcp: mcpRouter,
  drift: driftRouter,
  members: membersRouter,
  incidentAutomation: incidentAutomationRouter,
  sso: ssoRouter,
  evidencePack: evidencePackRouter,
  materiality: materialityRouter,
  fairness: fairnessRouter,
  vendor: vendorRouter,
  dossier: dossierRouter,
  incidentTrends: incidentTrendsRouter,
  orgHierarchy: orgHierarchyRouter,
  scim: scimRouter,
  externalReports: externalReportsRouter,
  alignmentAudit: alignmentAuditRouter,
  usageInsights: usageInsightsRouter,
  trustCenter: trustCenterRouter,
});
export type AppRouter = typeof appRouter;
