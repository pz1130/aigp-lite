import type { ReportTemplate } from "../types";

export const mindforgeTemplate: ReportTemplate = {
  id: "mindforge",
  displayKey: "reports.templates.mindforge",
  version: "2025",
  controls: [
    {
      id: "C1",
      title: "Board and Senior Management Oversight",
      category: "1. AI Governance & Oversight",
      description:
        "Ensure board and senior management maintain accountability for AI strategy, risk appetite and material deployment decisions.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C1" },
    },
    {
      id: "C2",
      title: "AI Governance Framework and Structure",
      category: "1. AI Governance & Oversight",
      description:
        "Establish an enterprise AI governance framework integrated with existing risk and technology governance structures.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C2" },
    },
    {
      id: "C3",
      title: "Policies, Standards and Procedures",
      category: "1. AI Governance & Oversight",
      description:
        "Maintain policies and technical standards governing acceptable AI use, data handling and model risk across the organisation.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C3" },
    },
    {
      id: "C4",
      title: "Roles, Responsibilities and Competency",
      category: "1. AI Governance & Oversight",
      description:
        "Define three-lines accountability, model ownership and AI literacy so staff can operate and challenge AI systems responsibly.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C4" },
    },
    {
      id: "C5",
      title: "AI Risk Identification",
      category: "2. AI Risk Identification and Assessment",
      description:
        "Identify AI risks across the use-case inventory using the MindForge taxonomy and emerging threat intelligence.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C5" },
    },
    {
      id: "C6",
      title: "AI Risk Assessment and Measurement",
      category: "2. AI Risk Identification and Assessment",
      description:
        "Assess inherent and residual AI risks, quantify model performance and drift, and document conclusions for oversight.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C6" },
    },
    {
      id: "C7",
      title: "Model Development & Validation",
      category: "3. AI Lifecycle Management",
      description:
        "Develop and validate models with fairness, robustness and independent challenge before production release.",
      dataSource: "fairness_assessment",
      query: {},
    },
    {
      id: "C8",
      title: "Data Management",
      category: "3. AI Lifecycle Management",
      description:
        "Govern training and production data with quality criteria, access controls and third-party provenance checks.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C8" },
    },
    {
      id: "C9",
      title: "Model Deployment and Release",
      category: "3. AI Lifecycle Management",
      description:
        "Gate production releases on validation evidence, staged rollout and version tracking for material models.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C9" },
    },
    {
      id: "C10",
      title: "Model Monitoring and Performance",
      category: "3. AI Lifecycle Management",
      description:
        "Monitor production model performance, drift and business KPIs with alert investigation and remediation.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C10" },
    },
    {
      id: "C11",
      title: "Model Change and Retirement",
      category: "3. AI Lifecycle Management",
      description:
        "Control material model changes, plan safe retirement and preserve audit trails across model versions.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C11" },
    },
    {
      id: "C12",
      title: "Human-AI Interaction and Oversight",
      category: "4. AI Operations & Monitoring",
      description:
        "Design meaningful human oversight, train users on AI limitations and monitor override patterns.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C12" },
    },
    {
      id: "C13",
      title: "Third-Party and Outsourcing Management",
      category: "4. AI Operations & Monitoring",
      description:
        "Due-diligence third-party AI providers, contract for model-change notification and monitor outsourced performance.",
      dataSource: "vendor_due_diligence",
      query: {},
    },
    {
      id: "C14",
      title: "Incident Management and Response",
      category: "4. AI Operations & Monitoring",
      description:
        "Define AI incident playbooks, escalate material events and conduct post-incident review and remediation.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C14" },
    },
    {
      id: "C15",
      title: "Communication and Transparency",
      category: "4. AI Operations & Monitoring",
      description:
        "Disclose AI use to customers, provide explainability for high-impact decisions and communicate limitations internally.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C15" },
    },
    {
      id: "C16",
      title: "Audit and Independent Review",
      category: "4. AI Operations & Monitoring",
      description:
        "Include AI controls in internal audit plans, test effectiveness and track findings to closure.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C16" },
    },
    {
      id: "C17",
      title: "Regulatory Engagement and Reporting",
      category: "4. AI Operations & Monitoring",
      description:
        "Monitor supervisory AI guidance, prepare regulatory reporting and engage authorities on material changes.",
      dataSource: "mindforge_consideration",
      query: { considerationCode: "C17" },
    },
  ],
};
