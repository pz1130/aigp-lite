import type { ReportTemplate } from "../types";

export const soc2Type2Template: ReportTemplate = {
  id: "soc2-type2",
  displayKey: "reports.templates.soc2_type2",
  version: "2024.1",
  controls: [
    // ── CC1 Control Environment ───────────────────────────────────────────────
    {
      id: "CC1.1",
      category: "CC1",
      title: "COSO Principle 2 — Board and senior management oversight",
      description:
        "The board and senior management oversee the entity's internal control system and set the tone for the integrity, ethics, and cybersecurity posture.",
      dataSource: "narrative",
    },
    {
      id: "CC1.2",
      category: "CC1",
      title: "COSO Principle 6 — Specifies desirable competencies",
      description:
        "Management specifies desired competencies for roles that have significant impact on internal control effectiveness.",
      dataSource: "narrative",
    },
    {
      id: "CC1.3",
      category: "CC1",
      title: "COSO Principle 7 — Identifies and assesses competence",
      description:
        "The entity identifies and assesses whether personnel possess the competencies required to perform their assigned duties.",
      dataSource: "narrative",
    },
    {
      id: "CC1.4",
      category: "CC1",
      title: "COSO Principle 15 — Evaluates internal component communications",
      description:
        "The entity evaluates and communicates internal control deficiencies in a timely manner to those responsible for remediation.",
      dataSource: "narrative",
    },
    {
      id: "CC1.5",
      category: "CC1",
      title: "Board and management oversight of internal control",
      description:
        "The board and management demonstrate independence from management in overseeing internal controls and risk management.",
      dataSource: "narrative",
    },

    // ── CC2 Communication ───────────────────────────────────────────────────
    {
      id: "CC2.1",
      category: "CC2",
      title: "Information and communication — internal",
      description:
        "The entity internally communicates information, including objectives and responsibilities for internal control.",
      dataSource: "policy",
    },
    {
      id: "CC2.2",
      category: "CC2",
      title: "Information and communication — external",
      description:
        "The entity communicates with external parties regarding matters affecting the effectiveness of internal control.",
      dataSource: "audit",
    },
    {
      id: "CC2.3",
      category: "CC2",
      title: "Internal control communication",
      description:
        "The entity internally communicates control deficiency information to parties responsible for remediation.",
      dataSource: "narrative",
    },

    // ── CC3 Risk Assessment ─────────────────────────────────────────────────
    {
      id: "CC3.1",
      category: "CC3",
      title: "Risk identification and assessment",
      description:
        "The entity identifies and assesses risks to the achievement of objectives and documents the risk assessment process.",
      dataSource: "risk",
    },
    {
      id: "CC3.2",
      category: "CC3",
      title: "Fraud risk assessment",
      description:
        "The entity assesses and documents fraud risk, including the potential for misstatement due to fraud or misuse of assets.",
      dataSource: "risk",
    },
    {
      id: "CC3.3",
      category: "CC3",
      title: "Risks from changed vendor relationships",
      description:
        "The entity assesses risks arising from changes in vendor relationships or the introduction of new services.",
      dataSource: "risk",
    },
    {
      id: "CC3.4",
      category: "CC3",
      title: "New service offering risk assessment",
      description:
        "Risks associated with new service offerings are identified and assessed prior to launch.",
      dataSource: "risk",
    },

    // ── CC4 Monitoring Activities ────────────────────────────────────────────
    {
      id: "CC4.1",
      category: "CC4",
      title: "Ongoing and/or separate evaluations",
      description:
        "The entity uses ongoing evaluations, separate evaluations, or a combination of both to ascertain whether internal control components are present and functioning.",
      dataSource: "audit",
    },
    {
      id: "CC4.2",
      category: "CC4",
      title: "Remediation process for deficiencies",
      description:
        "The entity remediates internal control deficiencies in a timely manner.",
      dataSource: "audit",
    },

    // ── CC5 Control Activities ──────────────────────────────────────────────
    {
      id: "CC5.1",
      category: "CC5",
      title: "Selects and develops control activities",
      description:
        "The entity selects and develops control activities that contribute to the mitigation of risks to acceptable levels.",
      dataSource: "policy",
    },
    {
      id: "CC5.2",
      category: "CC5",
      title: "Deploys through policies and procedures",
      description:
        "The entity deploys control activities through policies and procedures that are established and communicated.",
      dataSource: "policy",
    },
    {
      id: "CC5.3",
      category: "CC5",
      title: "Uses relevant technologies",
      description:
        "The entity selects and develops relevant technology controls to support the achievement of objectives.",
      dataSource: "policy",
    },

    // ── CC6 Logical and Physical Access Controls ────────────────────────────
    {
      id: "CC6.1",
      category: "CC6",
      title: "Authentication and authorization",
      description:
        "The entity implements logical access security software, infrastructure, and architectures to protect against unauthorized access.",
      dataSource: "audit",
      query: { resourceType: { prefix: "rbac." } },
    },
    {
      id: "CC6.2",
      category: "CC6",
      title: "Added, modified, removed — authorization",
      description:
        "Prior to issuing system credentials, the entity registers and authorizes new internal and external users.",
      dataSource: "audit",
      query: { resourceType: { prefix: "rbac." } },
    },
    {
      id: "CC6.3",
      category: "CC6",
      title: "Role restrictions and prohibitions",
      description:
        "The entity restricts user access to systems, facilities, and sensitive data to authorized personnel.",
      dataSource: "evidence",
    },
    {
      id: "CC6.4",
      category: "CC6",
      title: "System accounts",
      description:
        "The entity uses designated security protocols, including elevated privileges, for managing system accounts.",
      dataSource: "narrative",
    },
    {
      id: "CC6.5",
      category: "CC6",
      title: "Access credentials",
      description:
        "The entity removes system credentials when appropriate and removes or disables dormant accounts.",
      dataSource: "audit",
      query: { action: "rbac.revoke" },
    },
    {
      id: "CC6.6",
      category: "CC6",
      title: "Security for sensitive data",
      description:
        "The entity implements controls to protect against unauthorized access to sensitive data.",
      dataSource: "evidence",
    },
    {
      id: "CC6.7",
      category: "CC6",
      title: "Confidential information export",
      description:
        "The entity restricts the export of confidential information to authorized users and transmission mechanisms.",
      dataSource: "evidence",
    },
    {
      id: "CC6.8",
      category: "CC6",
      title: "Batch jobs and transmission controls",
      description:
        "The entity governs the execution of batch jobs and the transmission of sensitive data.",
      dataSource: "narrative",
    },

    // ── CC7 System Operations ────────────────────────────────────────────────
    {
      id: "CC7.1",
      category: "CC7",
      title: "Detects anomalies",
      description:
        "The entity monitors system components and the operation of those components for anomalies.",
      dataSource: "incident",
    },
    {
      id: "CC7.2",
      category: "CC7",
      title: "Monitors system components",
      description:
        "The entity employs change detection mechanisms to identify system components that have been affected by or compromised by unauthorized changes.",
      dataSource: "audit",
    },
    {
      id: "CC7.3",
      category: "CC7",
      title: "Incident management",
      description:
        "The entity has processes and procedures for identifying, classifying, and responding to security incidents.",
      dataSource: "incident",
    },
    {
      id: "CC7.4",
      category: "CC7",
      title: "Security event analysis",
      description:
        "The entity analyzes security events to determine whether they result in or have the potential to result in a security incident.",
      dataSource: "audit",
    },
    {
      id: "CC7.5",
      category: "CC7",
      title: "Security incident detection and response",
      description:
        "The entity detects and investigates security incidents and takes action to remediate and recover from them.",
      dataSource: "incident",
    },

    // ── CC8 Change Management ────────────────────────────────────────────────
    {
      id: "CC8.1",
      category: "CC8",
      title: "Change management process",
      description:
        "The entity authorizes, designs, develops, configures, tests, approves, and implements changes to infrastructure, data, software, and procedures.",
      dataSource: "audit",
      query: { action: { prefix: "policy." } },
    },

    // ── CC9 Risk Mitigation ─────────────────────────────────────────────────
    {
      id: "CC9.1",
      category: "CC9",
      title: "Identifies new risk mitigation",
      description:
        "The entity identifies, selects, and develops risk mitigation activities to address identified risks.",
      dataSource: "risk",
    },
    {
      id: "CC9.2",
      category: "CC9",
      title: "Ongoing risk mitigation",
      description:
        "The entity monitors risk mitigation activities and maintains risk mitigation plans to address residual risk.",
      dataSource: "policy",
    },

    // ── A1 Availability ──────────────────────────────────────────────────────
    {
      id: "A1.1",
      category: "A1",
      title: "Environmental protections",
      description:
        "The entity protects against environmental threats and implements environmental controls to safeguard its premises and information assets.",
      dataSource: "incident",
    },
    {
      id: "A1.2",
      category: "A1",
      title: "Availability commitments",
      description:
        "The entity maintains commitments to availability and communicates availability commitments and tolerances to internal and external users.",
      dataSource: "incident",
    },
  ],
};
