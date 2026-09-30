import { prisma } from "@/lib/db";
import { usecaseEvents } from "@/lib/events/bus";
import { webhookBus } from "@/lib/integrations/webhook-bus";
import { enqueueJob } from "@/lib/jobs/enqueue";
import type { UsecaseEventPayload } from "@/lib/events/bus";

async function handleUsecaseApproved(payload: UsecaseEventPayload) {
  const { orgId, usecaseId } = payload;
  const u = await prisma.aiUsecase.findUnique({
    where: { id: usecaseId },
    select: { name: true },
  });
  await enqueueJob("webhook.deliver", {
    orgId,
    event: "usecase.approved",
    data: { usecaseId, name: u?.name ?? "" },
  });
}

async function handleUsecaseRejected(payload: UsecaseEventPayload) {
  const { orgId, usecaseId } = payload;
  const u = await prisma.aiUsecase.findUnique({
    where: { id: usecaseId },
    select: { name: true },
  });
  await enqueueJob("webhook.deliver", {
    orgId,
    event: "usecase.rejected",
    data: { usecaseId, name: u?.name ?? "" },
  });
}

usecaseEvents.onApproved(handleUsecaseApproved);
usecaseEvents.onRejected(handleUsecaseRejected);

type BudgetEvent = {
  orgId: string;
  budgetId: string;
  scope: string;
  scopeRefId: string | null;
  threshold: number;
  period: string;
  periodKey: string;
  amountUsd: number;
};

webhookBus.on("budget.threshold.exceeded", async (event: BudgetEvent) => {
  await enqueueJob("webhook.deliver", {
    orgId: event.orgId,
    event: "budget.threshold.exceeded",
    data: event,
  });
});
