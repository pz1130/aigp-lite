import { prisma } from "@/lib/db";
import { usecaseEvents } from "@/lib/events/bus";
import { workflowEvents } from "@/lib/events/workflow-bus";

export { PROMOTION_TEMPLATE } from "./templates";

/**
 * Gets or creates the default promotion template for an org.
 */
export async function getOrCreateDefaultTemplate(
  orgId: string,
  createdBy: string,
) {
  const existing = await prisma.workflowTemplate.findFirst({
    where: { orgId, isDefault: true },
  });
  if (existing) return existing;

  return prisma.workflowTemplate.create({
    data: {
      orgId,
      name: "Promotion",
      description: "Standard AI usecase promotion workflow",
      isDefault: true,
      createdBy,
      steps: {
        create: [
          {
            stepIndex: 0,
            stepName: "Risk Assessment",
            assigneeRole: "risk_officer",
          },
          {
            stepIndex: 1,
            stepName: "Security Review",
            assigneeRole: "ai_owner",
          },
          { stepIndex: 2, stepName: "Final Approval", assigneeRole: "admin" },
        ],
      },
    },
  });
}

/**
 * Starts a new promotion workflow for an AI usecase.
 * If templateId is provided, uses that template; otherwise gets or creates the default.
 * Creates a WorkflowInstance (state=open, currentStep=0) and steps from the template.
 */
export async function startWorkflow(
  orgId: string,
  usecaseId: string,
  templateId?: string,
  createdBy?: string,
) {
  let template;
  if (templateId) {
    template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId, orgId },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
    if (!template)
      throw new Error(`Template ${templateId} not found for org ${orgId}`);
  } else {
    template = await getOrCreateDefaultTemplate(orgId, createdBy ?? "");
    // re-fetch with steps
    template = await prisma.workflowTemplate.findUnique({
      where: { id: template.id },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
  }

  const instance = await prisma.workflowInstance.create({
    data: {
      orgId,
      usecaseId,
      template: template!.name,
      templateId: template!.id,
      currentStep: 0,
      state: "open",
    },
  });

  await prisma.workflowStep.createMany({
    data: template!.steps.map((s) => ({
      instanceId: instance.id,
      stepIndex: s.stepIndex,
      stepName: s.stepName,
      assigneeRole: s.assigneeRole ?? null,
      assigneeUserId: s.assigneeUserId ?? null,
    })),
  });

  const step0 = template!.steps[0];
  if (step0) {
    workflowEvents.emitStepAssigned({
      orgId,
      instanceId: instance.id,
      stepIndex: 0,
      stepName: step0.stepName,
      assigneeUserId: step0.assigneeUserId ?? null,
      assigneeRole: step0.assigneeRole ?? null,
      usecaseId,
    });
  }

  return instance;
}

/**
 * Records a decision on the current workflow step and advances the workflow.
 *
 * - "approved"  → advances currentStep; on last step also sets state=completed
 *                  and emits usecase.approved
 * - "rejected"  → sets state=cancelled and emits usecase.rejected
 * - "requested_changes" → records the decision but keeps workflow open
 *
 * Throws if stepIndex does not match the instance's currentStep.
 */
export async function decideStep(
  instanceId: string,
  stepIndex: number,
  decision: "approved" | "rejected" | "requested_changes",
  byUserId: string,
  comment?: string,
) {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
  });

  if (!instance) throw new Error(`WorkflowInstance ${instanceId} not found`);
  if (instance.state !== "open")
    throw new Error(`WorkflowInstance ${instanceId} is not open`);
  if (stepIndex !== instance.currentStep)
    throw new Error(
      `Step index ${stepIndex} is not the current step (${instance.currentStep})`,
    );

  const isLastStep = (await getStepCount(instanceId)) - 1 === stepIndex;

  // Record the step decision
  await prisma.workflowStep.update({
    where: { instanceId_stepIndex: { instanceId, stepIndex } },
    data: {
      decision,
      decidedById: byUserId,
      comment: comment ?? "",
      decidedAt: new Date(),
    },
  });

  if (decision === "rejected") {
    const updated = await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { state: "cancelled", closedAt: new Date() },
    });
    usecaseEvents.emitRejected({
      orgId: instance.orgId,
      usecaseId: instance.usecaseId,
      byUserId,
    });
    workflowEvents.emitWorkflowCancelled({
      orgId: instance.orgId,
      instanceId,
      usecaseId: instance.usecaseId,
      byUserId,
      comment,
    });
    return updated;
  }

  if (decision === "approved" && isLastStep) {
    const updated = await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { state: "completed", closedAt: new Date() },
    });
    usecaseEvents.emitApproved({
      orgId: instance.orgId,
      usecaseId: instance.usecaseId,
      byUserId,
    });
    return updated;
  }

  if (decision === "approved") {
    const updated = await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { currentStep: instance.currentStep + 1 },
    });
    const nextStep = await prisma.workflowStep.findUnique({
      where: {
        instanceId_stepIndex: {
          instanceId,
          stepIndex: instance.currentStep + 1,
        },
      },
    });
    if (nextStep) {
      workflowEvents.emitStepAssigned({
        orgId: instance.orgId,
        instanceId,
        stepIndex: nextStep.stepIndex,
        stepName: nextStep.stepName,
        assigneeUserId: nextStep.assigneeUserId,
        assigneeRole: nextStep.assigneeRole,
        usecaseId: instance.usecaseId,
      });
    }
    return updated;
  }

  // "requested_changes" — workflow stays open
  return instance;
}

/**
 * Checks if a user can decide the current step.
 * Returns true if user is admin OR the assignee of the current step.
 */
export async function canUserDecide(
  instanceId: string,
  userId: string,
  userRole: string,
): Promise<boolean> {
  if (userRole === "admin") return true;
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    select: { currentStep: true },
  });
  if (!instance) return false;
  const step = await prisma.workflowStep.findUnique({
    where: {
      instanceId_stepIndex: { instanceId, stepIndex: instance.currentStep },
    },
  });
  if (!step) return false;
  if (step.assigneeUserId === userId) return true;
  if (step.assigneeRole === userRole) return true;
  return false;
}

async function getStepCount(instanceId: string): Promise<number> {
  return prisma.workflowStep.count({ where: { instanceId } });
}

/**
 * Fetches a workflow instance including its ordered steps.
 */
export async function getWorkflowInstance(id: string) {
  return prisma.workflowInstance.findUnique({
    where: { id },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
}
