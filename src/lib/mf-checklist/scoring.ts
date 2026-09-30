export type CheckStatus = "unanswered" | "yes" | "no" | "na";
export interface AnswerLite {
  status: CheckStatus;
}

export interface ConsiderationScore {
  considerationCode: string;
  total: number;
  answered: number;
  yes: number;
  no: number;
  na: number;
  unanswered: number;
  completionPct: number;
  conformancePct: number | null;
}

const pct = (n: number, d: number): number =>
  d === 0 ? 0 : Math.round((n / d) * 100);

export function scoreConsideration(
  considerationCode: string,
  answers: AnswerLite[],
): ConsiderationScore {
  let yes = 0;
  let no = 0;
  let na = 0;
  let unanswered = 0;
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
    considerationCode,
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

export function scoreOverall(
  considerations: ConsiderationScore[],
): OverallScore {
  const sum = (k: keyof ConsiderationScore) =>
    considerations.reduce((acc, c) => acc + (c[k] as number), 0);
  const total = sum("total");
  const answered = sum("answered");
  const yes = sum("yes");
  const no = sum("no");
  const na = sum("na");
  const unanswered = sum("unanswered");
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
