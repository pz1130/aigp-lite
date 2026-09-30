export class ExternalReportStateError extends Error {
  constructor(from: string, to: string) {
    super(`Illegal external-report transition: ${from} -> ${to}`);
    this.name = "ExternalReportStateError";
  }
}

export const TRANSITIONS: Record<string, string[]> = {
  received: ["triaging", "accepted", "rejected", "duplicate"],
  triaging: ["accepted", "rejected", "duplicate"],
  accepted: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
  duplicate: [],
};

export const TERMINAL = new Set<string>(["resolved", "rejected", "duplicate"]);

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) throw new ExternalReportStateError(from, to);
}
