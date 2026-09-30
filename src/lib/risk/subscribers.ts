import { prisma } from "@/lib/db";
import { usecaseEvents, type UsecaseEventPayload } from "@/lib/events/bus";
import { scoreUsecase, type AutonomyLevel } from "@/lib/risk/scoring";
import { info as logInfo, error as logError } from "@/lib/observability/logger";
import { SYSTEM_USER_ID } from "@/lib/auth/system-user";

/**
 * Subscribes to usecase.approved and auto-generates a risk assessment.
 * Per M5 plan T2 — when a workflow reaches final approval, an assessment
 * is computed from the usecase's autonomy level and control statuses.
 */
async function handleUsecaseApproved(payload: UsecaseEventPayload) {
  const { orgId, usecaseId } = payload;
  try {
    const u = await prisma.aiUsecase.findUnique({ where: { id: usecaseId } });
    if (!u) {
      logError("risk-subscriber: usecase not found", { orgId, usecaseId });
      return;
    }

    const statuses = await prisma.usecaseControlStatus.findMany({
      where: { usecaseId },
      include: { control: true },
    });

    const result = scoreUsecase(
      u.autonomyLevel as AutonomyLevel,
      statuses.map((s) => ({
        id: s.controlId,
        status: s.status as
          | "not_applicable"
          | "not_started"
          | "in_progress"
          | "satisfied"
          | "failed",
        severity: s.control.severity as "low" | "medium" | "high",
        name: s.control.title,
        description: s.control.description,
      })),
    );

    await prisma.usecaseRiskAssessment.create({
      data: {
        orgId,
        usecaseId,
        scoreInt: result.scoreInt,
        level: result.level as "low" | "medium" | "high",
        notes: "Auto-generated on workflow approval",
        assessedById: SYSTEM_USER_ID,
      },
    });

    logInfo("risk-subscriber: auto-assessment created", {
      orgId,
      usecaseId,
      scoreInt: result.scoreInt,
      level: result.level,
    });
  } catch (err) {
    // Log-not-throw: usecase approval is already committed; don't orphan it
    logError("risk-subscriber: auto-assess failed", {
      orgId,
      usecaseId,
      err: String(err),
    });
  }
}

usecaseEvents.onApproved(handleUsecaseApproved);
