export type RuleJson = unknown;

export interface EvalContext {
  scope: "input" | "output";
  text: string;
  usecase?: { id: string; autonomyLevel: string };
  org?: { id: string };
  metadata?: Record<string, unknown>;
}

export interface Hit {
  policyId: string;
  policyName: string;
  mode: "block" | "warn" | "log";
  scope: "input" | "output";
  snippet: string;
  matchedFields: string[];
  severity: "low" | "medium" | "high";
}

export interface PolicyDescriptor {
  id: string;
  name: string;
  ruleJson: RuleJson;
  enforcementMode: "block" | "warn" | "log";
  scope: "input" | "output" | "both";
  severity: "low" | "medium" | "high";
}
