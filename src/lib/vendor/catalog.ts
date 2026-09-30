import type { VendorType, DueDiligenceStatus } from "@/lib/prisma";

export type DomainCode = "DP" | "SEC" | "LEG" | "MOD" | "OPS";

export interface DueDiligenceItem {
  code: string;
  domain: DomainCode;
  question: string;
  appliesTo: VendorType[];
  severity: "standard" | "critical";
}

const ALL: VendorType[] = ["model_provider", "data_vendor", "tooling_vendor"];

export const DOMAINS: { code: DomainCode; label: string }[] = [
  { code: "DP", label: "Data & Privacy" },
  { code: "SEC", label: "Security & Integration" },
  { code: "LEG", label: "Contract & Legal" },
  { code: "MOD", label: "Model Transparency" },
  { code: "OPS", label: "Operational Resilience" },
];

// Original AIGP wording; structure/codes follow MindForge taxonomy but this is
// not an official MindForge/MAS/ABS mapping or endorsement.
export const DUE_DILIGENCE_CATALOG: DueDiligenceItem[] = [
  {
    code: "DP-1",
    domain: "DP",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the vendor document the provenance and licensing basis of the data used to train or tune the models or services it supplies?",
  },
  {
    code: "DP-2",
    domain: "DP",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the vendor disclose its sub-processors and the locations where your data is stored or processed?",
  },
  {
    code: "DP-3",
    domain: "DP",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Can the vendor commit to the data-residency and cross-border-transfer constraints your organisation requires?",
  },
  {
    code: "DP-4",
    domain: "DP",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the vendor provide documented controls for handling, retaining and deleting personal data you supply?",
  },

  {
    code: "SEC-1",
    domain: "SEC",
    appliesTo: ALL,
    severity: "critical",
    question:
      "Does the vendor hold a current recognised security certification (for example SOC 2 Type II or ISO/IEC 27001)?",
  },
  {
    code: "SEC-2",
    domain: "SEC",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Are the vendor's APIs and integration points secured with authentication, encryption in transit and documented access scoping?",
  },
  {
    code: "SEC-3",
    domain: "SEC",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the vendor follow a documented process for managing secrets, credentials and key rotation on the integration?",
  },

  {
    code: "LEG-1",
    domain: "LEG",
    appliesTo: ALL,
    severity: "critical",
    question:
      "Does the contract allocate liability and provide indemnification appropriate to the risk the vendor introduces?",
  },
  {
    code: "LEG-2",
    domain: "LEG",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Are intellectual-property and content-licensing terms, including rights to outputs, clearly defined in the contract?",
  },
  {
    code: "LEG-3",
    domain: "LEG",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the contract provide exit, termination-assistance and data-portability terms that avoid lock-in?",
  },

  {
    code: "MOD-1",
    domain: "MOD",
    appliesTo: ["model_provider"],
    severity: "standard",
    question:
      "Does the vendor provide model documentation describing intended use, training approach and known limitations?",
  },
  {
    code: "MOD-2",
    domain: "MOD",
    appliesTo: ["model_provider"],
    severity: "standard",
    question:
      "Does the vendor share independent or third-party evaluation evidence for the models it supplies?",
  },
  {
    code: "MOD-3",
    domain: "MOD",
    appliesTo: ["model_provider"],
    severity: "standard",
    question:
      "Does the vendor commit to advance notification of material model or version changes?",
  },

  {
    code: "OPS-1",
    domain: "OPS",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the vendor commit to a defined service-level objective for availability and support response?",
  },
  {
    code: "OPS-2",
    domain: "OPS",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the vendor commit to notifying you of security or service incidents within a defined timeframe?",
  },
  {
    code: "OPS-3",
    domain: "OPS",
    appliesTo: ALL,
    severity: "standard",
    question:
      "Does the vendor maintain documented business-continuity and disaster-recovery arrangements?",
  },
];

export interface AnswerLite {
  itemCode: string;
  status: DueDiligenceStatus;
}

export function applicableItems(
  vendorType: VendorType,
  answers: AnswerLite[],
): DueDiligenceItem[] {
  const naCodes = new Set(
    answers.filter((a) => a.status === "not_applicable").map((a) => a.itemCode),
  );
  return DUE_DILIGENCE_CATALOG.filter(
    (i) => i.appliesTo.includes(vendorType) && !naCodes.has(i.code),
  );
}
