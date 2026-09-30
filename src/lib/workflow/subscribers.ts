import { usecaseEvents, type UsecaseEventPayload } from "@/lib/events/bus";
import { startWorkflow } from "@/lib/workflow/engine";

/**
 * Subscribes to usecase.created and auto-starts the promotion workflow.
 * Per design doc §6.2 — every new usecase enters the promotion pipeline.
 *
 * Failures are logged but do not roll back the usecase creation: the
 * usecase is already committed and a missing workflow can be recovered
 * by the manual StartWorkflowForm UI on /workflow.
 */
async function handleUsecaseCreated(payload: UsecaseEventPayload) {
  const { orgId, usecaseId } = payload;
  try {
    await startWorkflow(orgId, usecaseId);
  } catch (err) {
    console.error(
      `[workflow-subscriber] failed to auto-start workflow for usecase ${usecaseId}:`,
      err,
    );
  }
}

if (process.env.NODE_ENV !== "test") {
  usecaseEvents.onCreated(handleUsecaseCreated);
}
