import type { ModuleConfig } from "./types";
import inventory from "@/app/[locale]/(dashboard)/(modules)/inventory/module.config";
import members from "@/app/[locale]/(dashboard)/(modules)/members/module.config";
import risk from "@/app/[locale]/(dashboard)/(modules)/risk/module.config";
import maturity from "@/app/[locale]/(dashboard)/(modules)/maturity/module.config";
import { POLICY_MODULE } from "@/app/[locale]/(dashboard)/(modules)/policy/module.config";
import workflow from "@/app/[locale]/(dashboard)/(modules)/workflow/module.config";
import evidence from "@/app/[locale]/(dashboard)/(modules)/evidence/module.config";
import audit from "@/app/[locale]/(dashboard)/(modules)/audit/module.config";
import dataLineage from "@/app/[locale]/(dashboard)/(modules)/data-lineage/module.config";
import integrations from "@/app/[locale]/(dashboard)/(modules)/integrations/module.config";
import providers from "@/app/[locale]/(dashboard)/(modules)/providers/module.config";
import incidents from "@/app/[locale]/(dashboard)/(modules)/incidents/module.config";
import reports from "@/app/[locale]/(dashboard)/(modules)/reports/module.config";
import finops from "@/app/[locale]/(dashboard)/(modules)/finops/module.config";
import redteam from "@/app/[locale]/(dashboard)/(modules)/redteam/module.config";
import mcp from "@/app/[locale]/(dashboard)/(modules)/mcp/module.config";
import drift from "@/app/[locale]/(dashboard)/(modules)/drift/module.config";
import aivtf from "@/app/[locale]/(dashboard)/(modules)/aivtf/module.config";
import frontierRiskTier from "@/app/[locale]/(dashboard)/(modules)/frontier-risk-tier/module.config";
import transparencyReport from "@/app/[locale]/(dashboard)/(modules)/transparency-report/module.config";
import incidentTrends from "@/app/[locale]/(dashboard)/(modules)/incident-trends/module.config";
import vendors from "@/app/[locale]/(dashboard)/(modules)/vendors/module.config";
import mindforgeChecklist from "@/app/[locale]/(dashboard)/(modules)/mindforge-checklist/module.config";
import agenticGovernance from "@/app/[locale]/(dashboard)/(modules)/agentic-governance/module.config";
import externalReports from "@/app/[locale]/(dashboard)/(modules)/external-reports/module.config";
import alignmentAudit from "@/app/[locale]/(dashboard)/(modules)/alignment-audit/module.config";
import usageInsights from "@/app/[locale]/(dashboard)/(modules)/usage-insights/module.config";
import trustCenter from "@/app/[locale]/(dashboard)/(modules)/trust-center/module.config";

export const MODULES: readonly ModuleConfig[] = [
  inventory,
  members,
  risk,
  maturity,
  POLICY_MODULE,
  workflow,
  evidence,
  audit,
  dataLineage,
  integrations,
  providers,
  incidents,
  reports,
  finops,
  redteam,
  mcp,
  drift,
  aivtf,
  frontierRiskTier,
  transparencyReport,
  incidentTrends,
  vendors,
  mindforgeChecklist,
  agenticGovernance,
  externalReports,
  alignmentAudit,
  usageInsights,
  trustCenter,
];
