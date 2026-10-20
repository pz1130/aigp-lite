import { prisma } from "@/lib/db";
import { usecaseEvents } from "@/lib/events/bus";
import type { UsecaseEventPayload } from "@/lib/events/bus";

/**
 * Subscribes to usecase.approved events and promotes the usecase's
 * lifecycleStage from development → production. AI analysis is intentionally
 * not automatic in Core; classification is entered during inventory setup.
 */
function handleUsecaseApproved(payload: UsecaseEventPayload) {
  const { orgId, usecaseId } = payload;
  prisma.aiUsecase
    .update({
      where: { id: usecaseId, orgId },
      data: { lifecycleStage: "production" },
    })
    .catch((err) =>
      console.error(
        `[inventory-subscriber] failed to promote usecase ${usecaseId}:`,
        err,
      ),
    );
}

usecaseEvents.onApproved(handleUsecaseApproved);
