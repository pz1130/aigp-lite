export interface TxrSectionDef {
  key: string;
  /** Own-worded English title (used by PDF/XLSX and as i18n fallback). */
  title: string;
  /** Own-worded English authoring guidance. */
  guidance: string;
  required: boolean;
}

export const SECTIONS: TxrSectionDef[] = [
  {
    key: "system_description",
    title: "System & model description",
    guidance:
      "Describe the frontier system this report covers: its intended purpose, capabilities, deployment surface, and the period of operation in scope.",
    required: true,
  },
  {
    key: "safeguards",
    title: "Safeguards & mitigations",
    guidance:
      "Summarize the technical and organizational safeguards in place (access controls, content filtering, monitoring, human oversight, kill-switch) and any changes during the period.",
    required: true,
  },
  {
    key: "evaluations",
    title: "Capability evaluations & testing",
    guidance:
      "Describe the evaluations, red-team exercises, and benchmarks run during the period, the methods used, and what they found.",
    required: true,
  },
  {
    key: "governance",
    title: "Governance & accountability",
    guidance:
      "Describe the governance structure: who is accountable, how decisions are escalated, and how this report was reviewed and approved.",
    required: true,
  },
  {
    key: "changes_note",
    title: "Changes since last edition",
    guidance:
      "Narrate the material changes since the previous published edition. The automated tier-delta table accompanies this section.",
    required: false,
  },
];

export const SECTION_KEYS = new Set<string>(SECTIONS.map((s) => s.key));

export function requiredSectionKeys(): string[] {
  return SECTIONS.filter((s) => s.required).map((s) => s.key);
}

export const TXR_META = {
  source: "transparency-report",
  attribution:
    "Conceptually inspired by the OpenAI Frontier Governance Framework (May 2026). All wording is original; no FGF text is reproduced.",
  note: "Authored-section prompts are maintained in code; this module is not a framework catalog source.",
} as const;
