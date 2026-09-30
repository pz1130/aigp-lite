import type { PolicyDescriptor } from "./types";

export const SAMPLE_POLICIES: PolicyDescriptor[] = [
  {
    id: "sample-ssn",
    name: "PII: US Social Security Number",
    ruleJson: {
      and: [{ regex_match: [{ var: ["text"] }, "\\d{3}-\\d{2}-\\d{4}"] }],
    },
    enforcementMode: "block",
    scope: "both",
    severity: "high",
  },
  {
    id: "sample-email",
    name: "PII: Email Leak",
    ruleJson: {
      and: [
        {
          regex_match: [
            { var: ["text"] },
            "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
          ],
        },
      ],
    },
    enforcementMode: "warn",
    scope: "input",
    severity: "medium",
  },
  {
    id: "sample-prompt-injection",
    name: "Prompt Injection",
    ruleJson: {
      and: [
        {
          contains_any: [
            { var: ["text"] },
            [
              "ignore previous instructions",
              "disregard your system prompt",
              "you are now",
              "forget all prior",
              "new instructions:",
            ],
          ],
        },
      ],
    },
    enforcementMode: "block",
    scope: "input",
    severity: "high",
  },
  {
    id: "sample-brand-disallowed",
    name: "Brand Disallowed Terms",
    ruleJson: {
      and: [
        {
          contains_any: [
            { var: ["text"] },
            ["CompetitorX", "BadBrand", "OutdatedProduct"],
          ],
        },
      ],
    },
    enforcementMode: "warn",
    scope: "output",
    severity: "medium",
  },
  {
    id: "sample-length-cap",
    name: "Input Length Cap (10k)",
    ruleJson: { length_gt: [{ var: ["text"] }, 10000] },
    enforcementMode: "block",
    scope: "input",
    severity: "low",
  },
];
