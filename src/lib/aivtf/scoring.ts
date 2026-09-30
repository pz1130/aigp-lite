export type CheckStatus = "unanswered" | "yes" | "no" | "na";
export interface AnswerLite {
  status: CheckStatus;
}

export interface PrincipleScore {
  principleNum: number;
  total: number;
  answered: number; // yes + no + na
  yes: number;
  no: number;
  na: number;
  unanswered: number;
  completionPct: number; // answered / total, 0..100
  conformancePct: number | null; // yes / (yes+no), null when denominator 0
}

const pct = (n: number, d: number): number =>
  d === 0 ? 0 : Math.round((n / d) * 100);

export function scorePrinciple(
  principleNum: number,
  answers: AnswerLite[],
): PrincipleScore {
  let yes = 0,
    no = 0,
    na = 0,
    unanswered = 0;
  for (const a of answers) {
    if (a.status === "yes") yes++;
    else if (a.status === "no") no++;
    else if (a.status === "na") na++;
    else unanswered++;
  }
  const total = answers.length;
  const answered = yes + no + na;
  const denom = yes + no;
  return {
    principleNum,
    total,
    answered,
    yes,
    no,
    na,
    unanswered,
    completionPct: pct(answered, total),
    conformancePct: denom === 0 ? null : pct(yes, denom),
  };
}

export interface OverallScore {
  total: number;
  answered: number;
  yes: number;
  no: number;
  na: number;
  unanswered: number;
  completionPct: number;
  conformancePct: number | null;
}

export function scoreOverall(principles: PrincipleScore[]): OverallScore {
  const sum = (k: keyof PrincipleScore) =>
    principles.reduce((acc, p) => acc + (p[k] as number), 0);
  const total = sum("total"),
    answered = sum("answered");
  const yes = sum("yes"),
    no = sum("no"),
    na = sum("na"),
    unanswered = sum("unanswered");
  const denom = yes + no;
  return {
    total,
    answered,
    yes,
    no,
    na,
    unanswered,
    completionPct: pct(answered, total),
    conformancePct: denom === 0 ? null : pct(yes, denom),
  };
}
