import type { PrismaClient } from "@/lib/prisma";

export type ReportFormat = "pdf" | "xlsx";
export type ReportTemplateId =
  | "nist-ai-rmf"
  | "iso-27001"
  | "soc2-type2"
  | "iso-42001"
  | "eu-ai-act"
  | "mindforge";
export type ControlStatus =
  "implemented" | "partial" | "not-implemented" | "n/a";
export type DataSource =
  | "inventory"
  | "risk"
  | "audit"
  | "incident"
  | "maturity"
  | "policy"
  | "workflow"
  | "evidence"
  | "data_lineage"
  | "narrative"
  | "fria"
  | "eu_obligation"
  | "mindforge_consideration"
  | "fairness_assessment"
  | "vendor_due_diligence";

export interface ReportPeriod {
  start: Date;
  end: Date;
}

export interface Control {
  id: string;
  title: string;
  category: string;
  description: string;
  dataSource: DataSource;
  query?: Record<string, unknown>;
}

export interface EvidenceItem {
  kind: string;
  id: string;
  ref: string;
  capturedAt: Date;
}

export interface AggregatedControl extends Control {
  status: ControlStatus;
  evidenceCount: number;
  evidenceItems: EvidenceItem[];
  notes?: string;
}

export interface ReportData {
  template: ReportTemplate;
  period: ReportPeriod;
  org: { id: string; name: string };
  generatedAt: Date;
  generatedBy: { id: string; name: string };
  controls: AggregatedControl[];
  summary: {
    total: number;
    implemented: number;
    partial: number;
    notImplemented: number;
    na: number;
  };
  incidents: Array<{
    id: string;
    openedAt: Date;
    severity: string;
    status: string;
    title: string;
  }>;
  auditHighlights: Array<{
    id: string;
    action: string;
    resourceType: string;
    createdAt: Date;
    actor?: string;
  }>;
}

export interface ReportTemplate {
  id: ReportTemplateId;
  displayKey: string;
  version: string;
  controls: Control[];
  enrich?: (data: ReportData, db: PrismaClient) => Promise<ReportData>;
}
