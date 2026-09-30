import type { ReportTemplate } from "../types";

/**

* NIST AI RMF 1.0 (January 2023) compliance report template. * Covers Govern, Map, Measure, Manage functions with 32 controls. */
export const nistAiRmfTemplate: ReportTemplate = {
  id: "nist-ai-rmf",
  displayKey: "reports.template.nistAiRmf.name",
  version: "1.0",
  controls: [
    // GOVERN
    {
      id: "GV.OC-01",
      title: "Organizational context for AI systems is established",
      category: "GOVERN",
      description:
        "Understand the organizational context including mission, objectives, and stakeholder expectations.",
      dataSource: "narrative",
    },
    {
      id: "GV.OC-02",
      title: "Legal, regulatory, and contractual requirements are identified",
      category: "GOVERN",
      description:
        "Identify and document applicable laws, regulations, and contractual obligations.",
      dataSource: "policy",
    },
    {
      id: "GV.OC-03",
      title: "AI system dependencies on external components are identified",
      category: "GOVERN",
      description:
        "Identify and document external components, services, and data sources.",
      dataSource: "inventory",
    },
    {
      id: "GV.OC-04",
      title: "AI system purpose and intended use are articulated",
      category: "GOVERN",
      description:
        "Clearly define the AI system's intended purpose, use cases, and boundaries.",
      dataSource: "narrative",
    },
    {
      id: "GV.OC-05",
      title: "Bias, privacy, and civil rights concerns are identified",
      category: "GOVERN",
      description:
        "Identify potential bias, privacy risks, and civil rights implications.",
      dataSource: "risk",
    },
    {
      id: "GV.OC-06",
      title: "Organizational AI stakeholder responsibilities are established",
      category: "GOVERN",
      description:
        "Define roles, responsibilities, and accountability structures.",
      dataSource: "narrative",
    },
    {
      id: "GV.PO-01",
      title: "AI risk management plan is established",
      category: "GOVERN",
      description:
        "Develop a comprehensive risk management plan addressing AI-specific risks.",
      dataSource: "policy",
    },
    {
      id: "GV.PO-02",
      title: "AI risk management plan is monitored",
      category: "GOVERN",
      description:
        "Continuously monitor and update the AI risk management plan.",
      dataSource: "policy",
    },
    {
      id: "GV.SC-01",
      title: "Supply chain risk management is established",
      category: "GOVERN",
      description: "Establish processes to manage AI supply chain risks.",
      dataSource: "inventory",
    },
    {
      id: "GV.SC-02",
      title: "AI system third-party risks are identified",
      category: "GOVERN",
      description:
        "Identify and assess risks from third-party AI components and services.",
      dataSource: "audit",
      query: { actionPrefix: "provider.connection." },
    },
    // MAP
    {
      id: "MP.CT-01",
      title: "AI system categorization is conducted",
      category: "MAP",
      description:
        "Categorize the AI system based on intended use and potential impact.",
      dataSource: "inventory",
    },
    {
      id: "MP.CT-02",
      title: "AI system impact level is determined",
      category: "MAP",
      description:
        "Determine the impact level on individuals, organizations, and society.",
      dataSource: "risk",
    },
    {
      id: "MP.CT-03",
      title: "AI system functional and nonfunctional requirements are defined",
      category: "MAP",
      description: "Define clear functional and nonfunctional requirements.",
      dataSource: "inventory",
    },
    {
      id: "MP.CT-04",
      title: "AI system criticality is assessed",
      category: "MAP",
      description:
        "Assess the criticality of the AI system to mission-critical operations.",
      dataSource: "maturity",
    },
    {
      id: "MP.IA-01",
      title: "AI system impact assessment is conducted",
      category: "MAP",
      description:
        "Conduct a comprehensive impact assessment examining potential harms.",
      dataSource: "risk",
    },
    {
      id: "MP.RA-01",
      title: "AI system risk analysis is performed",
      category: "MAP",
      description:
        "Analyze identified risks to determine likelihood and potential impact.",
      dataSource: "risk",
    },
    {
      id: "MP.RA-02",
      title: "AI system threat modeling is performed",
      category: "MAP",
      description:
        "Identify and analyze potential threats including adversarial attacks.",
      dataSource: "risk",
    },
    // MEASURE
    {
      id: "MS.MM-01",
      title: "AI system metrics are defined",
      category: "MEASURE",
      description:
        "Define measurable metrics for performance, safety, and fairness.",
      dataSource: "maturity",
    },
    {
      id: "MS.MM-02",
      title: "AI system metrics are monitored",
      category: "MEASURE",
      description:
        "Continuously monitor AI system metrics against defined thresholds.",
      dataSource: "audit",
      query: { actionPrefix: "runtime.llm." },
    },
    {
      id: "MS.MM-03",
      title: "AI system metrics are reported",
      category: "MEASURE",
      description: "Report AI system metrics to relevant stakeholders.",
      dataSource: "audit",
    },
    {
      id: "MS.PE-01",
      title: "AI system performance is measured",
      category: "MEASURE",
      description: "Measure and track AI system performance metrics.",
      dataSource: "audit",
      query: { actionPrefix: "runtime.llm." },
    },
    {
      id: "MS.PE-02",
      title: "AI system reliability is measured",
      category: "MEASURE",
      description: "Measure AI system reliability and availability.",
      dataSource: "maturity",
    },
    {
      id: "MS.PE-03",
      title: "AI system robustness is measured",
      category: "MEASURE",
      description:
        "Measure AI system robustness against adversarial conditions.",
      dataSource: "incident",
    },
    {
      id: "MS.PE-04",
      title: "AI system fairness is measured",
      category: "MEASURE",
      description: "Measure AI system fairness across demographic groups.",
      dataSource: "risk",
    },
    {
      id: "MS.TT-01",
      title: "AI system testing is conducted",
      category: "MEASURE",
      description:
        "Conduct structured testing of AI system capabilities and limitations.",
      dataSource: "evidence",
    },
    // MANAGE
    {
      id: "MG.RR-01",
      title: "AI system risk response is developed",
      category: "MANAGE",
      description: "Develop response strategies for identified AI risks.",
      dataSource: "policy",
    },
    {
      id: "MG.RR-02",
      title: "AI system risk response is implemented",
      category: "MANAGE",
      description: "Implement risk response strategies and controls.",
      dataSource: "policy",
    },
    {
      id: "MG.RR-03",
      title: "AI system risk response is monitored",
      category: "MANAGE",
      description: "Monitor and evaluate the effectiveness of risk responses.",
      dataSource: "incident",
    },
    {
      id: "MG.MA-01",
      title: "AI system maintenance is managed",
      category: "MANAGE",
      description: "Manage ongoing maintenance and updates to AI systems.",
      dataSource: "workflow",
    },
    {
      id: "MG.MA-02",
      title: "AI system disposal is managed",
      category: "MANAGE",
      description: "Manage the retirement and disposal of AI systems and data.",
      dataSource: "workflow",
    },
    {
      id: "MG.MA-03",
      title: "AI system configuration management is performed",
      category: "MANAGE",
      description: "Maintain configuration control of AI systems.",
      dataSource: "audit",
      query: { actionPrefix: "policy." },
    },
    {
      id: "MG.RM-01",
      title: "AI system incident management is planned",
      category: "MANAGE",
      description: "Plan and prepare for AI system incidents.",
      dataSource: "incident",
    },
    {
      id: "MG.RM-02",
      title: "AI system incident response is executed",
      category: "MANAGE",
      description: "Execute incident response procedures when incidents occur.",
      dataSource: "incident",
    },
  ],
};
