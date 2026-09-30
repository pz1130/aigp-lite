export const FRAMEWORKS = [
  {
    code: "EU_AI_ACT",
    name: "EU AI Act",
    version: "2024",
    controls: [
      {
        code: "Art.9",
        title: "Risk management system",
        description:
          "Establish, implement, document and maintain a risk management system for high-risk AI.",
        severity: "high" as const,
      },
      {
        code: "Art.10",
        title: "Data and data governance",
        description:
          "Training, validation and testing data sets shall be relevant, representative, free of errors and complete.",
        severity: "high" as const,
      },
      {
        code: "Art.11",
        title: "Technical documentation",
        description:
          "Draw up technical documentation before placing on the market.",
        severity: "medium" as const,
      },
      {
        code: "Art.13",
        title: "Transparency for users",
        description:
          "High-risk AI systems shall be designed to enable users to interpret outputs.",
        severity: "high" as const,
      },
      {
        code: "Art.14",
        title: "Human oversight",
        description:
          "Measures enabling natural persons to oversee the AI system.",
        severity: "high" as const,
      },
      {
        code: "Art.15",
        title: "Accuracy, robustness, cybersecurity",
        description:
          "Achieve appropriate level of accuracy, robustness, and cybersecurity.",
        severity: "high" as const,
      },
    ],
  },
  {
    code: "NIST_AI_RMF",
    name: "NIST AI Risk Management Framework",
    version: "1.0",
    controls: [
      {
        code: "GOVERN-1.1",
        title: "Legal and regulatory requirements understood",
        description:
          "Legal and regulatory requirements involving AI are understood, managed, and documented.",
        severity: "high" as const,
      },
      {
        code: "MAP-1.1",
        title: "Intended purpose articulated",
        description:
          "Intended purposes, beneficial uses, context, and assumptions are documented.",
        severity: "medium" as const,
      },
      {
        code: "MEASURE-2.7",
        title: "AI system security and resilience",
        description:
          "Examined and documented for resilience to adversarial attacks and failures.",
        severity: "high" as const,
      },
      {
        code: "MEASURE-2.11",
        title: "Fairness and bias evaluated",
        description:
          "Fairness and bias of AI system are evaluated and results documented.",
        severity: "high" as const,
      },
      {
        code: "MANAGE-2.3",
        title: "Incident response procedures",
        description:
          "Procedures are followed to respond to and recover from a previously unknown risk.",
        severity: "medium" as const,
      },
    ],
  },
  {
    code: "ISO_42001",
    name: "ISO/IEC 42001 AI Management System",
    version: "2023",
    controls: [
      {
        code: "5.2",
        title: "AI policy",
        description: "Top management shall establish an AI policy.",
        severity: "medium" as const,
      },
      {
        code: "6.1.4",
        title: "AI system impact assessment",
        description:
          "The organization shall plan and perform AI system impact assessments.",
        severity: "high" as const,
      },
      {
        code: "8.3",
        title: "AI system development lifecycle",
        description:
          "Establish processes for the responsible AI system development lifecycle.",
        severity: "high" as const,
      },
      {
        code: "9.2",
        title: "Internal audit",
        description: "Conduct internal audits at planned intervals.",
        severity: "medium" as const,
      },
      {
        code: "9.3",
        title: "Management review",
        description:
          "Top management shall review the AI management system at planned intervals.",
        severity: "medium" as const,
      },
    ],
  },
] as const;
