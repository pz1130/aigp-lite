export type FrtAnswerStatus = "unanswered" | "met" | "not_met" | "na";

export interface AnswerLite {
  tier: number;
  status: FrtAnswerStatus;
}

export interface CategoryScore {
  categoryCode: string;
  total: number;
  answered: number;
  met: number;
  notMet: number;
  na: number;
  unanswered: number;
  completionPct: number;
  assignedTier: number;
}

export interface OverallScore {
  total: number;
  answered: number;
  met: number;
  notMet: number;
  na: number;
  unanswered: number;
  completionPct: number;
  assignedTier: number;
}

const pct = (n: number, d: number): number =>
  d === 0 ? 0 : Math.round((n / d) * 100);

export function tierReached(answers: AnswerLite[], t: number): boolean {
  return answers.some((a) => a.tier === t && a.status === "met");
}

export function scoreCategory(
  categoryCode: string,
  answers: AnswerLite[],
): CategoryScore {
  let met = 0;
  let notMet = 0;
  let na = 0;
  let unanswered = 0;
  for (const a of answers) {
    if (a.status === "met") met++;
    else if (a.status === "not_met") notMet++;
    else if (a.status === "na") na++;
    else unanswered++;
  }
  const total = answers.length;
  const answered = met + notMet + na;
  let assignedTier = 0;
  for (const t of [1, 2, 3]) {
    if (tierReached(answers, t)) assignedTier = t;
  }
  return {
    categoryCode,
    total,
    answered,
    met,
    notMet,
    na,
    unanswered,
    completionPct: pct(answered, total),
    assignedTier,
  };
}

export function scoreOverall(categories: CategoryScore[]): OverallScore {
  const sum = (k: keyof CategoryScore) =>
    categories.reduce((acc, c) => acc + (c[k] as number), 0);
  const total = sum("total");
  const answered = sum("answered");
  const met = sum("met");
  const notMet = sum("notMet");
  const na = sum("na");
  const unanswered = sum("unanswered");
  const assignedTier = categories.reduce(
    (m, c) => Math.max(m, c.assignedTier),
    0,
  );
  return {
    total,
    answered,
    met,
    notMet,
    na,
    unanswered,
    completionPct: pct(answered, total),
    assignedTier,
  };
}

export function tierLabel(n: number): string {
  return n === 0 ? "Not reached" : `Tier ${n}`;
}
