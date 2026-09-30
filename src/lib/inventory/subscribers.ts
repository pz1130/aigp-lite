import { prisma } from "@/lib/db";
import { usecaseEvents } from "@/lib/events/bus";
import type { UsecaseEventPayload } from "@/lib/events/bus";
import { runAnalysisInBackground } from "./analyze";
import { scheduleAnalysisDebounced } from "./analyze/debounce";

const ANALYSIS_DISABLED = process.env.NODE_ENV === "test";

/**
 * Subscribes to usecase.approved events and promotes the usecase's
 * lifecycleStage from development → production.
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

function handleUsecaseCreated(payload: UsecaseEventPayload) {
  if (ANALYSIS_DISABLED) return;
  runAnalysisInBackground({
    orgId: payload.orgId,
    usecaseId: payload.usecaseId,
    reason: "auto_created",
    actorId: payload.byUserId,
  });
}

function handleUsecaseUpdated(payload: UsecaseEventPayload) {
  if (ANALYSIS_DISABLED) return;
  scheduleAnalysisDebounced({
    orgId: payload.orgId,
    usecaseId: payload.usecaseId,
    reason: "auto_updated",
    actorId: payload.byUserId,
  });
}

usecaseEvents.onApproved(handleUsecaseApproved);
usecaseEvents.onCreated(handleUsecaseCreated);
usecaseEvents.onUpdated(handleUsecaseUpdated);
