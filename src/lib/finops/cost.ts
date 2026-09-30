import { prisma } from "@/lib/db";

// BudgetPeriod will be added to Prisma schema in M10; define locally for now
export type BudgetPeriod = "daily" | "weekly" | "monthly";

export interface CostBucket {
  key: string;
  label?: string;
  costUsd: number;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CostSummaryOpts {
  orgId: string;
  period: { start: Date; end: Date };
  groupBy: "day" | "apiKey" | "usecase" | "model" | "provider";
}

const groupColumn: Record<CostSummaryOpts["groupBy"], string> = {
  day: `DATE("ts")`,
  apiKey: `"apiKeyId"`,
  usecase: `"usecaseId"`,
  model: `"model"`,
  provider: `"provider"`,
};

interface CostSummaryRow {
  key: string | null;
  costUsd: number | null;
  invocations: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function getCostSummary(
  opts: CostSummaryOpts,
): Promise<CostBucket[]> {
  const col = groupColumn[opts.groupBy];
  const rows = await prisma.$queryRawUnsafe<CostSummaryRow[]>(
    `
    SELECT ${col} AS key,
           SUM(COALESCE("cost_usd", 0))::float8 AS "costUsd",
           COUNT(*)::int AS invocations,
           SUM("inputTokens")::int AS "inputTokens",
           SUM("outputTokens")::int AS "outputTokens"
    FROM "llm_invocation"
    WHERE "orgId" = $1 AND "ts" >= $2 AND "ts" < $3
    GROUP BY ${col}
    ORDER BY "costUsd" DESC
  `,
    opts.orgId,
    opts.period.start,
    opts.period.end,
  );
  return rows.map((r) => ({
    key: String(r.key ?? ""),
    costUsd: Number(r.costUsd ?? 0),
    invocations: Number(r.invocations ?? 0),
    inputTokens: Number(r.inputTokens ?? 0),
    outputTokens: Number(r.outputTokens ?? 0),
  }));
}

export function periodToRange(
  period: BudgetPeriod,
  asOf: Date,
): { start: Date; end: Date } {
  const d = new Date(asOf);
  if (period === "daily") {
    const start = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  if (period === "weekly") {
    const day = (d.getUTCDay() + 6) % 7;
    const start = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end };
}

export function formatPeriodKey(
  period: BudgetPeriod,
  range: { start: Date },
): string {
  const s = range.start.toISOString().slice(0, 10);
  if (period === "daily") return s;
  if (period === "monthly") return s.slice(0, 7);
  const d = range.start;
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 +
      yearStart.getUTCDay() +
      1) /
      7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getScopeTotal(
  scope: "org" | "api_key" | "usecase",
  refId: string | null,
  orgId: string,
  range: { start: Date; end: Date },
): Promise<number> {
  const where: {
    orgId: string;
    ts: { gte: Date; lt: Date };
    apiKeyId?: string;
    usecaseId?: string;
  } = {
    orgId,
    ts: { gte: range.start, lt: range.end },
  };
  if (scope === "api_key" && refId) where.apiKeyId = refId;
  if (scope === "usecase" && refId) where.usecaseId = refId;
  const agg = await prisma.llmInvocation.aggregate({
    _sum: { costUsd: true },
    where,
  });
  return Number(agg._sum.costUsd ?? 0);
}
