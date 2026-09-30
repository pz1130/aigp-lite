import type { PrismaClient } from "@/lib/prisma";

// Every Prisma model that carries a NON-NULLABLE `orgId` belongs to exactly
// one organization and MUST be tenant-scoped here. The set below is kept in
// sync with the schema by `orgIsolation.test.ts`, which fails if a new
// required-orgId model is added without being listed here.
export const ORG_SCOPED = new Set<string>([
  "AgChkAssessment",
  "AiUsecase",
  "AivtfAssessment",
  "AlignmentAudit",
  "AlignmentResult",
  "ApiKey",
  "AsiChkAssessment",
  "AuditLog",
  "AuditSink",
  "Budget",
  "DataSource",
  "DriftBenchmark",
  "DriftPrompt",
  "DriftResult",
  "DriftRun",
  "EnterpriseIntegration",
  "Evaluation",
  "ExternalReport",
  "Evidence",
  "EvidencePack",
  "FrtAssessment",
  "GoLiveReview",
  "GovernanceMaturityAssessment",
  "GovernanceScoreSnapshot",
  "Incident",
  "IncidentMergeSuggestion",
  "IncidentRcaDraft",
  "IncidentTrendCluster",
  "IncidentTrendReport",
  "UsageInsightCluster",
  "UsageInsightReport",
  "LlmInvocation",
  "McpServer",
  "McpTool",
  "McpToolInvocation",
  "McpToolSnapshot",
  "Membership",
  "MfChecklistAssessment",
  "NemoGuardrailEvidence",
  "Notification",
  "OrgIncidentAutomationConfig",
  "OrgInvite",
  "Policy",
  "PolicyAssistantGeneration",
  "PolicyEvaluation",
  "ProviderConnection",
  "RedteamAttestation",
  "RedteamPromptCustom",
  "Report",
  "RiskCopilotSuggestion",
  "ScimConnection",
  "SsoConnection",
  "TrustAccessToken",
  "TrustProfile",
  "TrustSnapshot",
  "TxrReport",
  "UsecaseCatalogRiskLink",
  "UsecaseClassification",
  "UsecaseControlStatus",
  "UsecaseFairnessAssessment",
  "UsecaseFria",
  "UsecaseMateriality",
  "UsecaseRiskAssessment",
  "Vendor",
  "VendorUsecaseLink",
  "WebhookEndpoint",
  "WorkflowInstance",
  "WorkflowTemplate",
]);

// Models that carry a NULLABLE `orgId` and therefore must NOT be auto-scoped
// by simple `orgId = X` equality injection. RiskCatalog is a hybrid catalog:
// built-in framework rows are global (`orgId = null`) and shared across every
// tenant, while org-authored rows set `orgId`. Injecting `orgId = X` would hide
// all global rows and break the catalog, so its (already org-aware) call sites
// filter explicitly with `OR: [{ orgId }, { orgId: null }]` instead.
export const ORG_NULLABLE_UNSCOPED = new Set<string>(["RiskCatalog"]);

type MutableArgs = Record<string, unknown>;

function asMutableArgs(value: unknown): MutableArgs {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MutableArgs)
    : {};
}

export function withOrg(client: PrismaClient, orgId: string) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !ORG_SCOPED.has(model)) return query(args);
          const a = asMutableArgs(args);

          if (operation === "create") {
            const data = asMutableArgs(a.data);
            if (data.orgId && data.orgId !== orgId) {
              throw new Error(`org_id mismatch on ${model}.create`);
            }
            a.data = { ...data, orgId };
          } else if (operation === "createMany") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((raw) => {
              const data = asMutableArgs(raw);
              if (data.orgId && data.orgId !== orgId) {
                throw new Error(`org_id mismatch on ${model}.createMany`);
              }
              return { ...data, orgId };
            });
          } else if (operation === "upsert") {
            // Inject orgId into where, but skip if it's already inside a composite unique key
            const w = asMutableArgs(a.where);
            const orgIdInComposite = Object.values(w).some(
              (v) =>
                v &&
                typeof v === "object" &&
                "orgId" in (v as Record<string, unknown>),
            );
            if (orgIdInComposite) {
              for (const v of Object.values(w)) {
                if (
                  v &&
                  typeof v === "object" &&
                  (v as Record<string, unknown>).orgId !== undefined
                ) {
                  if ((v as Record<string, unknown>).orgId !== orgId) {
                    throw new Error(`org_id mismatch on ${model}.upsert.where`);
                  }
                }
              }
            } else {
              a.where = { ...w, orgId };
            }
            // Prisma upsert uses top-level create/update, not nested under data
            const create = asMutableArgs(a.create);
            if (create.orgId && create.orgId !== orgId) {
              throw new Error(`org_id mismatch on ${model}.upsert.create`);
            }
            a.create = { ...create, orgId };
          } else if (
            operation === "findFirst" ||
            operation === "findMany" ||
            operation === "findUnique" ||
            operation === "update" ||
            operation === "updateMany" ||
            operation === "delete" ||
            operation === "deleteMany" ||
            operation === "count" ||
            operation === "aggregate"
          ) {
            a.where = { ...asMutableArgs(a.where), orgId };
          }

          return query(a);
        },
      },
    },
  });
}

export type OrgScopedClient = ReturnType<typeof withOrg>;
