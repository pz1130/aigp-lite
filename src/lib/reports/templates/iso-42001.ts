import type { ReportTemplate } from "../types";

/**
 * ISO/IEC 42001:2023 — Artificial Intelligence Management System (AIMS)
 * Annex A controls across 9 categories (A.2–A.10)
 */
export const iso42001Template: ReportTemplate = {
  id: "iso-42001",
  displayKey: "reports.templates.iso42001",
  version: "2023",
  controls: [
    // ── A.2 AI Policy (2) ──────────────────────────────────────────────────
    {
      id: "A.2.1",
      title: "AI policy established",
      category: "A.2",
      description:
        "The organization shall establish, document, and maintain an AI policy appropriate to its purpose and context.",
      dataSource: "policy",
    },
    {
      id: "A.2.2",
      title: "AI policy reviewed",
      category: "A.2",
      description:
        "The AI policy shall be reviewed at planned intervals or upon significant changes to ensure its continued suitability and adequacy.",
      dataSource: "policy",
    },

    // ── A.3 Internal Organization (3) ─────────────────────────────────────
    {
      id: "A.3.1",
      title: "Roles and responsibilities for AI",
      category: "A.3",
      description:
        "The organization shall define and document the roles, responsibilities, and authorities relevant to the AI management system.",
      dataSource: "narrative",
    },
    {
      id: "A.3.2",
      title: "Organizational structure",
      category: "A.3",
      description:
        "The organization shall establish and maintain an organizational structure that supports the effective operation of the AI management system.",
      dataSource: "narrative",
    },
    {
      id: "A.3.3",
      title: "Awareness and training",
      category: "A.3",
      description:
        "The organization shall ensure that persons doing work under its control are aware of their contribution to the effectiveness of the AI management system and the implications of not conforming to its requirements.",
      dataSource: "narrative",
    },

    // ── A.4 Resources (5) ─────────────────────────────────────────────────
    {
      id: "A.4.1",
      title: "Infrastructure and computing resources",
      category: "A.4",
      description:
        "The organization shall determine, provide, and maintain the infrastructure and computing resources necessary for the operation of AI systems.",
      dataSource: "inventory",
    },
    {
      id: "A.4.2",
      title: "Data resources",
      category: "A.4",
      description:
        "The organization shall determine, provide, and maintain data resources sufficient to train, validate, test, and operate AI systems.",
      dataSource: "inventory",
    },
    {
      id: "A.4.3",
      title: "Knowledge management",
      category: "A.4",
      description:
        "The organization shall establish and maintain mechanisms for managing knowledge relevant to its AI systems.",
      dataSource: "inventory",
    },
    {
      id: "A.4.4",
      title: "Financial resources",
      category: "A.4",
      description:
        "The organization shall determine and provide the financial resources necessary for establishing, implementing, maintaining, and improving the AI management system.",
      dataSource: "inventory",
    },
    {
      id: "A.4.5",
      title: "Supplier relationships",
      category: "A.4",
      description:
        "The organization shall establish and maintain appropriate relationships with suppliers relevant to its AI systems.",
      dataSource: "inventory",
    },

    // ── A.5 Impact Assessments (3) ─────────────────────────────────────────
    {
      id: "A.5.1",
      title: "AI system impact assessment",
      category: "A.5",
      description:
        "The organization shall conduct and document AI system impact assessments prior to deployment, considering intended and unintended outcomes.",
      dataSource: "risk",
    },
    {
      id: "A.5.2",
      title: "Ongoing impact evaluation",
      category: "A.5",
      description:
        "The organization shall periodically evaluate the continued impact of AI systems during operation to identify emerging risks.",
      dataSource: "risk",
    },
    {
      id: "A.5.3",
      title: "Human rights and bias assessment",
      category: "A.5",
      description:
        "The organization shall assess AI systems for potential impacts on human rights and for bias, ensuring fairness and non-discrimination.",
      dataSource: "risk",
    },

    // ── A.6 AI Lifecycle (10) ──────────────────────────────────────────────
    {
      id: "A.6.1",
      title: "Requirements definition",
      category: "A.6",
      description:
        "The organization shall define, document, and maintain requirements for AI systems, including functional, performance, safety, and ethical requirements.",
      dataSource: "inventory",
    },
    {
      id: "A.6.2",
      title: "Design and development",
      category: "A.6",
      description:
        "The organization shall plan and control the design and development of AI systems in accordance with defined requirements.",
      dataSource: "inventory",
    },
    {
      id: "A.6.3",
      title: "Testing and validation",
      category: "A.6",
      description:
        "The organization shall test and validate AI systems to confirm they meet defined requirements before deployment.",
      dataSource: "inventory",
    },
    {
      id: "A.6.4",
      title: "Deployment",
      category: "A.6",
      description:
        "The organization shall plan and control the deployment of AI systems, ensuring readiness and appropriate transition procedures.",
      dataSource: "inventory",
    },
    {
      id: "A.6.5",
      title: "Operation and monitoring",
      category: "A.6",
      description:
        "The organization shall operate AI systems in accordance with documented procedures and continuously monitor their performance and behavior.",
      dataSource: "inventory",
    },
    {
      id: "A.6.6",
      title: "Maintenance",
      category: "A.6",
      description:
        "The organization shall plan and perform maintenance of AI systems to ensure continued suitability and performance.",
      dataSource: "inventory",
    },
    {
      id: "A.6.7",
      title: "Retirement/discontinuation",
      category: "A.6",
      description:
        "The organization shall define and implement procedures for the retirement or discontinuation of AI systems, including data handling and stakeholder notification.",
      dataSource: "inventory",
    },
    {
      id: "A.6.8",
      title: "Configuration management",
      category: "A.6",
      description:
        "The organization shall establish and maintain configuration management for AI systems to ensure integrity and traceability.",
      dataSource: "inventory",
    },
    {
      id: "A.6.9",
      title: "Change management",
      category: "A.6",
      description:
        "The organization shall establish and maintain a change management process for AI systems to evaluate and control modifications.",
      dataSource: "inventory",
    },
    {
      id: "A.6.10",
      title: "Documentation",
      category: "A.6",
      description:
        "The organization shall create and maintain documentation sufficient to demonstrate conformity to this document across the AI lifecycle.",
      dataSource: "inventory",
    },

    // ── A.7 Data for AI (4) ────────────────────────────────────────────────
    {
      id: "A.7.1",
      title: "Data quality",
      category: "A.7",
      description:
        "The organization shall implement processes to ensure data quality appropriate for the intended use of AI systems.",
      dataSource: "data_lineage",
      query: { select: { id: true } }, // count DataSource records
    },
    {
      id: "A.7.2",
      title: "Data governance",
      category: "A.7",
      description:
        "The organization shall establish and maintain data governance practices covering ownership, access, and usage of data for AI.",
      dataSource: "data_lineage",
      query: { select: { id: true } },
    },
    {
      id: "A.7.3",
      title: "Data protection",
      category: "A.7",
      description:
        "The organization shall ensure that personal data and sensitive data used in AI systems are protected in accordance with applicable laws and regulations.",
      dataSource: "data_lineage",
      query: { select: { id: true } },
    },
    {
      id: "A.7.4",
      title: "Data lineage",
      category: "A.7",
      description:
        "The organization shall maintain records of data provenance and lineage to ensure traceability throughout the AI lifecycle.",
      dataSource: "data_lineage",
      query: { select: { id: true } },
    },

    // ── A.8 Interested Parties (4) ─────────────────────────────────────────
    {
      id: "A.8.1",
      title: "Communication",
      category: "A.8",
      description:
        "The organization shall establish and maintain internal and external communication processes relevant to its AI management system.",
      dataSource: "narrative",
    },
    {
      id: "A.8.2",
      title: "Feedback",
      category: "A.8",
      description:
        "The organization shall establish mechanisms to receive, document, and respond to feedback from interested parties on AI system performance and behavior.",
      dataSource: "narrative",
    },
    {
      id: "A.8.3",
      title: "Documentation for interested parties",
      category: "A.8",
      description:
        "The organization shall make available to interested parties appropriate documentation about AI systems, including capabilities, limitations, and intended use.",
      dataSource: "narrative",
    },
    {
      id: "A.8.4",
      title: "Record keeping",
      category: "A.8",
      description:
        "The organization shall establish and maintain records to provide evidence of conformity to the AI management system requirements.",
      dataSource: "narrative",
    },

    // ── A.9 Use of AI (4) ──────────────────────────────────────────────────
    {
      id: "A.9.1",
      title: "AI system operation",
      category: "A.9",
      description:
        "The organization shall operate AI systems in accordance with documented procedures and applicable policies.",
      dataSource: "audit",
    },
    {
      id: "A.9.2",
      title: "Acceptable use policies",
      category: "A.9",
      description:
        "The organization shall define, document, and communicate acceptable use policies for AI systems.",
      dataSource: "audit",
    },
    {
      id: "A.9.3",
      title: "Human oversight",
      category: "A.9",
      description:
        "The organization shall implement appropriate human oversight mechanisms for AI systems, particularly for high-impact or consequential decisions.",
      dataSource: "audit",
    },
    {
      id: "A.9.4",
      title: "Incident response",
      category: "A.9",
      description:
        "The organization shall establish and maintain processes for identifying, reporting, investigating, and responding to AI-related incidents.",
      dataSource: "audit",
    },

    // ── A.10 Third-Party (3) ───────────────────────────────────────────────
    {
      id: "A.10.1",
      title: "Third-party assessments",
      category: "A.10",
      description:
        "The organization shall assess third-party AI providers and services to ensure they meet the organization's AI policy and requirements.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    {
      id: "A.10.2",
      title: "Contractual requirements",
      category: "A.10",
      description:
        "The organization shall include appropriate AI-related requirements in contracts with third-party providers.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    {
      id: "A.10.3",
      title: "Ongoing monitoring",
      category: "A.10",
      description:
        "The organization shall continuously monitor third-party AI services and providers for compliance with agreed requirements.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
  ],
};
