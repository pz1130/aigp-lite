import { prisma } from "@/lib/db";
import type { Budget } from "@/lib/prisma";
import { formatPeriodKey } from "./cost";

export async function findRelevantBudgets(opts: {
  orgId: string;
  apiKeyId?: string;
  usecaseId?: string;
}): Promise<Budget[]> {
  return prisma.budget.findMany({
    where: {
      orgId: opts.orgId,
      isActive: true,
      OR: [
        { scope: "org" },
        ...(opts.apiKeyId
          ? [{ scope: "api_key" as const, scopeRefId: opts.apiKeyId }]
          : []),
        ...(opts.usecaseId
          ? [{ scope: "usecase" as const, scopeRefId: opts.usecaseId }]
          : []),
      ],
    },
  });
}

export type AlertEmitter = (event: {
  orgId: string;
  budgetId: string;
  scope: string;
  scopeRefId: string | null;
  threshold: number;
  period: string;
  periodKey: string;
  amountUsd: number;
}) => Promise<void>;

export async function tryFireAlert(
  budget: Budget,
  threshold: 80 | 100,
  range: { start: Date; end: Date },
  emit: AlertEmitter,
): Promise<boolean> {
  const periodKey = formatPeriodKey(budget.period, range);
  try {
    await prisma.budgetAlert.create({
      data: { budgetId: budget.id, periodKey, threshold },
    });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") return false; // already alerted
    throw e;
  }
  await emit({
    orgId: budget.orgId,
    budgetId: budget.id,
    scope: budget.scope,
    scopeRefId: budget.scopeRefId,
    threshold,
    period: budget.period,
    periodKey,
    amountUsd: Number(budget.amountUsd),
  });
  return true;
}

export function secondsUntilPeriodEnd(range: { end: Date }): number {
  return Math.max(1, Math.floor((range.end.getTime() - Date.now()) / 1000));
}
