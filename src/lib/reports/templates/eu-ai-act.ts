// Structure adapted from Microsoft Agent Governance Toolkit (MIT)
// compliance/eu-ai-act-checklist.md. Article texts paraphrased from
// Regulation (EU) 2024/1689 (fair use; legislative text).
import type { ReportTemplate } from "../types";

export const euAiActTemplate: ReportTemplate = {
  id: "eu-ai-act",
  displayKey: "reports.templates.euAiAct",
  version: "2024",
  controls: [
    {
      id: "Art.4",
      title: "AI Literacy",
      category: "Ch.1",
      dataSource: "narrative",
      description:
        "Providers and deployers shall take measures to ensure a sufficient level of AI literacy of their staff and other persons dealing with the operation and use of AI systems on their behalf.",
    },
    {
      id: "Art.6",
      title: "High-Risk Classification",
      category: "Ch.3-S1",
      dataSource: "narrative",
      description:
        "Classification rules for high-risk AI systems. The organization shall determine whether its AI systems fall under Annex III categories or are safety components of products covered by Annex I.",
    },
    {
      id: "Art.9",
      title: "Risk Management System",
      category: "Ch.3-S2",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-9" },
      description:
        "Establish, implement, document and maintain a risk management system for high-risk AI systems as a continuous iterative process planned and run throughout the entire lifecycle.",
    },
    {
      id: "Art.10",
      title: "Data and Data Governance",
      category: "Ch.3-S2",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-10" },
      description:
        "Training, validation and testing data sets shall be subject to data governance practices appropriate for the intended purpose, including relevance, representativeness and bias mitigation.",
    },
    {
      id: "Art.11",
      title: "Technical Documentation",
      category: "Ch.3-S2",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-11" },
      description:
        "Draw up technical documentation before placing the high-risk AI system on the market or putting it into service, kept up to date.",
    },
    {
      id: "Art.12",
      title: "Record-Keeping and Logging",
      category: "Ch.3-S2",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-12" },
      description:
        "High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system.",
    },
    {
      id: "Art.13",
      title: "Transparency to Deployers",
      category: "Ch.3-S2",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-13" },
      description:
        "High-risk AI systems shall be designed and developed in such a way to ensure that their operation is sufficiently transparent to enable deployers to interpret a system's output and use it appropriately.",
    },
    {
      id: "Art.14",
      title: "Human Oversight",
      category: "Ch.3-S2",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-14" },
      description:
        "High-risk AI systems shall be designed and developed in such a way that they can be effectively overseen by natural persons during the period in which they are in use.",
    },
    {
      id: "Art.15",
      title: "Accuracy, Robustness and Cybersecurity",
      category: "Ch.3-S2",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-15" },
      description:
        "High-risk AI systems shall be designed and developed in such a way that they achieve an appropriate level of accuracy, robustness and cybersecurity, and that they perform consistently in those respects throughout their lifecycle.",
    },
    {
      id: "Art.26",
      title: "Deployer Obligations",
      category: "Ch.3-S3",
      dataSource: "incident",
      description:
        "Deployers of high-risk AI systems shall take appropriate technical and organisational measures to ensure they use such systems in accordance with the instructions for use, assign human oversight, monitor operation, and inform providers of serious incidents.",
    },
    {
      id: "Art.27",
      title: "Fundamental Rights Impact Assessment",
      category: "Ch.3-S3",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-27" },
      description:
        "Deployers of high-risk AI systems shall conduct a fundamental rights impact assessment before putting the system into use, documenting the impact on fundamental rights, the measures envisaged, and the outcome of the assessment.",
    },
    {
      id: "Art.50",
      title: "Transparency for Certain AI Systems",
      category: "Ch.4",
      dataSource: "eu_obligation",
      query: { obligationCode: "ART-50" },
      description:
        "Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the concerned natural persons are informed that they are interacting with an AI system.",
    },
  ],
};
