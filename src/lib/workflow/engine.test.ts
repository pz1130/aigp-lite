import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock db module before importing engine
vi.mock("@/lib/db", () => ({
  prisma: {
    workflowInstance: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workflowStep: {
      createMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    workflowTemplate: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock event bus
vi.mock("@/lib/events/bus", () => ({
  usecaseEvents: {
    emitApproved: vi.fn(),
    emitRejected: vi.fn(),
  },
}));

// Mock workflow event bus
vi.mock("@/lib/events/workflow-bus", () => ({
  workflowEvents: {
    emitStepAssigned: vi.fn(),
    emitWorkflowCancelled: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { usecaseEvents } from "@/lib/events/bus";
import { workflowEvents } from "@/lib/events/workflow-bus";
import {
  startWorkflow,
  decideStep,
  getWorkflowInstance,
  getOrCreateDefaultTemplate,
} from "./engine";
import type {
  Prisma,
  WorkflowInstance as WorkflowInstanceModel,
  WorkflowState,
  WorkflowStep as WorkflowStepModel,
} from "@/lib/prisma";

type WorkflowTemplateWithSteps = Prisma.WorkflowTemplateGetPayload<{
  include: { steps: true };
}>;
type WorkflowInstance = WorkflowInstanceModel;
type WorkflowStep = WorkflowStepModel;
type WorkflowInstanceWithSteps = Prisma.WorkflowInstanceGetPayload<{
  include: { steps: true };
}>;

const mockOrgId = "org-1";
const mockUsecaseId = "uc-1";
const mockUserId = "user-1";
const mockInstanceId = "wi-1";
const mockTemplateId = "tpl-1";

const standardPromotionSteps = [
  {
    stepIndex: 0,
    stepName: "Risk Assessment",
    assigneeRole: "risk_officer",
    assigneeUserId: null as string | null,
  },
  {
    stepIndex: 1,
    stepName: "Security Review",
    assigneeRole: "ai_owner",
    assigneeUserId: null as string | null,
  },
  {
    stepIndex: 2,
    stepName: "Final Approval",
    assigneeRole: "admin",
    assigneeUserId: null as string | null,
  },
];

const mockTemplate = {
  id: mockTemplateId,
  orgId: mockOrgId,
  name: "Promotion",
  description: "Standard AI usecase promotion workflow",
  isDefault: true,
  createdBy: mockUserId,
  createdAt: new Date(),
  updatedAt: new Date(),
  steps: standardPromotionSteps.map((s) => ({
    id: `tpl-step-${s.stepIndex}`,
    templateId: mockTemplateId,
    instructions: null,
    ...s,
  })),
} satisfies WorkflowTemplateWithSteps;

const createdInstance = {
  id: mockInstanceId,
  orgId: mockOrgId,
  usecaseId: mockUsecaseId,
  template: "Promotion",
  templateId: mockTemplateId,
  currentStep: 0,
  state: "open" as WorkflowState,
  createdAt: new Date(),
  closedAt: null,
} satisfies WorkflowInstance;

const updatedStep = {
  id: "ws-updated",
  instanceId: mockInstanceId,
  stepIndex: 0,
  stepName: "Risk Assessment",
  assigneeRole: "risk_officer",
  assigneeUserId: null,
  decidedById: mockUserId,
  decision: "approved",
  comment: "",
  decidedAt: new Date(),
} satisfies WorkflowStep;

describe("workflow engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getOrCreateDefaultTemplate
  // -------------------------------------------------------------------------

  describe("getOrCreateDefaultTemplate", () => {
    it("returns existing default template", async () => {
      vi.mocked(prisma.workflowTemplate.findFirst).mockResolvedValue(
        mockTemplate,
      );

      const result = await getOrCreateDefaultTemplate(mockOrgId, mockUserId);

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith({
        where: { orgId: mockOrgId, isDefault: true },
      });
      expect(result.id).toBe(mockTemplateId);
    });

    it("creates default template if none exists", async () => {
      vi.mocked(prisma.workflowTemplate.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.workflowTemplate.create).mockResolvedValue(mockTemplate);

      const result = await getOrCreateDefaultTemplate(mockOrgId, mockUserId);

      expect(prisma.workflowTemplate.create).toHaveBeenCalledWith({
        data: {
          orgId: mockOrgId,
          name: "Promotion",
          description: "Standard AI usecase promotion workflow",
          isDefault: true,
          createdBy: mockUserId,
          steps: {
            create: standardPromotionSteps.map((s) => ({
              stepIndex: s.stepIndex,
              stepName: s.stepName,
              assigneeRole: s.assigneeRole,
            })),
          },
        },
      });
      expect(result.id).toBe(mockTemplateId);
    });
  });

  // -------------------------------------------------------------------------
  // startWorkflow
  // -------------------------------------------------------------------------

  describe("startWorkflow", () => {
    it("creates a WorkflowInstance with state=open and currentStep=0", async () => {
      vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue(
        mockTemplate,
      );
      vi.mocked(prisma.workflowInstance.create).mockResolvedValue(
        createdInstance,
      );
      vi.mocked(prisma.workflowStep.createMany).mockResolvedValue({ count: 3 });

      const result = await startWorkflow(
        mockOrgId,
        mockUsecaseId,
        mockTemplateId,
      );

      expect(prisma.workflowInstance.create).toHaveBeenCalledOnce();
      expect(prisma.workflowInstance.create).toHaveBeenCalledWith({
        data: {
          orgId: mockOrgId,
          usecaseId: mockUsecaseId,
          template: "Promotion",
          templateId: mockTemplateId,
          currentStep: 0,
          state: "open",
        },
      });
      expect(result.id).toBe(mockInstanceId);
      expect(result.state).toBe("open");
      expect(result.currentStep).toBe(0);
    });

    it("creates WorkflowStep records from the template", async () => {
      vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue(
        mockTemplate,
      );
      vi.mocked(prisma.workflowInstance.create).mockResolvedValue(
        createdInstance,
      );
      vi.mocked(prisma.workflowStep.createMany).mockResolvedValue({ count: 3 });

      await startWorkflow(mockOrgId, mockUsecaseId, mockTemplateId);

      expect(prisma.workflowStep.createMany).toHaveBeenCalledOnce();
      expect(prisma.workflowStep.createMany).toHaveBeenCalledWith({
        data: standardPromotionSteps.map((s) => ({
          instanceId: mockInstanceId,
          stepIndex: s.stepIndex,
          stepName: s.stepName,
          assigneeRole: s.assigneeRole,
          assigneeUserId: s.assigneeUserId,
        })),
      });
    });

    it("creates steps with specific assigneeUserId when template step has one", async () => {
      const templateWithUserAssignee = {
        ...mockTemplate,
        steps: [
          {
            id: "tpl-step-0",
            templateId: mockTemplateId,
            stepIndex: 0,
            stepName: "Risk Assessment",
            assigneeRole: "risk_officer",
            assigneeUserId: "specific-user-1",
            instructions: null,
          },
        ],
      } satisfies WorkflowTemplateWithSteps;
      vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue(
        templateWithUserAssignee,
      );
      vi.mocked(prisma.workflowInstance.create).mockResolvedValue({
        ...createdInstance,
        currentStep: 0,
      });
      vi.mocked(prisma.workflowStep.createMany).mockResolvedValue({ count: 1 });

      await startWorkflow(mockOrgId, mockUsecaseId, mockTemplateId);

      expect(prisma.workflowStep.createMany).toHaveBeenCalledWith({
        data: [
          {
            instanceId: mockInstanceId,
            stepIndex: 0,
            stepName: "Risk Assessment",
            assigneeRole: "risk_officer",
            assigneeUserId: "specific-user-1",
          },
        ],
      });
    });

    it("falls back to getOrCreateDefaultTemplate when no templateId provided", async () => {
      vi.mocked(prisma.workflowTemplate.findFirst).mockResolvedValue(
        mockTemplate,
      );
      vi.mocked(prisma.workflowInstance.create).mockResolvedValue(
        createdInstance,
      );
      vi.mocked(prisma.workflowStep.createMany).mockResolvedValue({ count: 3 });

      const result = await startWorkflow(mockOrgId, mockUsecaseId);

      expect(prisma.workflowTemplate.findFirst).toHaveBeenCalledWith({
        where: { orgId: mockOrgId, isDefault: true },
      });
      expect(result.id).toBe(mockInstanceId);
    });

    it("throws when template not found for org", async () => {
      vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue(null);

      await expect(
        startWorkflow(mockOrgId, mockUsecaseId, "nonexistent-template"),
      ).rejects.toThrow(/not found for org/);
    });
  });

  // -------------------------------------------------------------------------
  // decideStep — approved
  // -------------------------------------------------------------------------

  describe("decideStep — approved", () => {
    it("advances currentStep when not on last step", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue(
        createdInstance,
      );
      vi.mocked(prisma.workflowStep.update).mockResolvedValue(updatedStep);
      vi.mocked(prisma.workflowInstance.update).mockResolvedValue({
        ...createdInstance,
        currentStep: 1,
      });
      vi.mocked(prisma.workflowStep.count).mockResolvedValue(3);

      await decideStep(mockInstanceId, 0, "approved", mockUserId);

      expect(prisma.workflowStep.update).toHaveBeenCalledWith({
        where: {
          instanceId_stepIndex: { instanceId: mockInstanceId, stepIndex: 0 },
        },
        data: {
          decision: "approved",
          decidedById: mockUserId,
          comment: "",
          decidedAt: expect.any(Date),
        },
      });
      expect(prisma.workflowInstance.update).toHaveBeenCalledWith({
        where: { id: mockInstanceId },
        data: { currentStep: 1 },
      });
      expect(usecaseEvents.emitApproved).not.toHaveBeenCalled();
    });

    it("completes workflow and emits usecase.approved when on last step", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue({
        ...createdInstance,
        currentStep: 2,
      });
      vi.mocked(prisma.workflowStep.update).mockResolvedValue(updatedStep);
      vi.mocked(prisma.workflowInstance.update).mockResolvedValue({
        ...createdInstance,
        state: "completed",
        closedAt: new Date(),
      });
      vi.mocked(prisma.workflowStep.count).mockResolvedValue(3);

      await decideStep(mockInstanceId, 2, "approved", mockUserId);

      expect(prisma.workflowInstance.update).toHaveBeenCalledWith({
        where: { id: mockInstanceId },
        data: { state: "completed", closedAt: expect.any(Date) },
      });
      expect(usecaseEvents.emitApproved).toHaveBeenCalledWith({
        orgId: mockOrgId,
        usecaseId: mockUsecaseId,
        byUserId: mockUserId,
      });
    });
  });

  // -------------------------------------------------------------------------
  // decideStep — rejected
  // -------------------------------------------------------------------------

  describe("decideStep — rejected", () => {
    it("cancels the workflow and emits usecase.rejected", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue({
        ...createdInstance,
        currentStep: 1,
      });
      vi.mocked(prisma.workflowStep.update).mockResolvedValue(updatedStep);
      vi.mocked(prisma.workflowInstance.update).mockResolvedValue({
        ...createdInstance,
        state: "cancelled",
        closedAt: new Date(),
      });

      await decideStep(mockInstanceId, 1, "rejected", mockUserId);

      expect(prisma.workflowInstance.update).toHaveBeenCalledWith({
        where: { id: mockInstanceId },
        data: { state: "cancelled", closedAt: expect.any(Date) },
      });
      expect(usecaseEvents.emitRejected).toHaveBeenCalledWith({
        orgId: mockOrgId,
        usecaseId: mockUsecaseId,
        byUserId: mockUserId,
      });
    });
  });

  // -------------------------------------------------------------------------
  // decideStep — requested_changes
  // -------------------------------------------------------------------------

  describe("decideStep — requested_changes", () => {
    it("keeps workflow open and records the decision", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue(
        createdInstance,
      );
      vi.mocked(prisma.workflowStep.update).mockResolvedValue(updatedStep);

      const result = await decideStep(
        mockInstanceId,
        0,
        "requested_changes",
        mockUserId,
        "Please add more risk controls",
      );

      expect(prisma.workflowStep.update).toHaveBeenCalledWith({
        where: {
          instanceId_stepIndex: { instanceId: mockInstanceId, stepIndex: 0 },
        },
        data: {
          decision: "requested_changes",
          decidedById: mockUserId,
          comment: "Please add more risk controls",
          decidedAt: expect.any(Date),
        },
      });
      expect(prisma.workflowInstance.update).not.toHaveBeenCalled();
      expect(result.state).toBe("open");
    });
  });

  // -------------------------------------------------------------------------
  // decideStep — invalid step index
  // -------------------------------------------------------------------------

  describe("decideStep — invalid step index", () => {
    it("throws an error when stepIndex does not match currentStep", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue({
        ...createdInstance,
        currentStep: 1,
      });

      await expect(
        decideStep(mockInstanceId, 0, "approved", mockUserId),
      ).rejects.toThrow("Step index 0 is not the current step (1)");
    });
  });

  // -------------------------------------------------------------------------
  // Event emissions
  // -------------------------------------------------------------------------

  describe("event emissions", () => {
    it("startWorkflow emits step.assigned for step 0", async () => {
      vi.mocked(prisma.workflowTemplate.findUnique).mockResolvedValue(
        mockTemplate,
      );
      vi.mocked(prisma.workflowInstance.create).mockResolvedValue(
        createdInstance,
      );
      vi.mocked(prisma.workflowStep.createMany).mockResolvedValue({ count: 3 });

      await startWorkflow(mockOrgId, mockUsecaseId, mockTemplateId, mockUserId);

      expect(workflowEvents.emitStepAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: mockOrgId,
          instanceId: mockInstanceId,
          stepIndex: 0,
          usecaseId: mockUsecaseId,
        }),
      );
    });

    it("decideStep approved (not last) emits step.assigned for next step", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue(
        createdInstance,
      );
      vi.mocked(prisma.workflowStep.update).mockResolvedValue(updatedStep);
      vi.mocked(prisma.workflowInstance.update).mockResolvedValue({
        ...createdInstance,
        currentStep: 1,
      });
      vi.mocked(prisma.workflowStep.count).mockResolvedValue(3);
      vi.mocked(prisma.workflowStep.findUnique).mockResolvedValue({
        id: "ws-2",
        instanceId: mockInstanceId,
        stepIndex: 1,
        stepName: "Security Review",
        assigneeRole: "ai_owner",
        assigneeUserId: null,
        decidedById: null,
        decision: "pending",
        comment: "",
        decidedAt: null,
      });

      await decideStep(mockInstanceId, 0, "approved", mockUserId);

      expect(workflowEvents.emitStepAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: mockInstanceId,
          stepIndex: 1,
          stepName: "Security Review",
        }),
      );
    });

    it("decideStep approved (last) emits NO step.assigned", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue({
        ...createdInstance,
        currentStep: 2,
      });
      vi.mocked(prisma.workflowStep.update).mockResolvedValue(updatedStep);
      vi.mocked(prisma.workflowInstance.update).mockResolvedValue({
        ...createdInstance,
        state: "completed",
        closedAt: new Date(),
      });
      vi.mocked(prisma.workflowStep.count).mockResolvedValue(3);

      await decideStep(mockInstanceId, 2, "approved", mockUserId);

      expect(workflowEvents.emitStepAssigned).not.toHaveBeenCalled();
    });

    it("decideStep rejected emits workflow.cancelled", async () => {
      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue({
        ...createdInstance,
        currentStep: 1,
      });
      vi.mocked(prisma.workflowStep.update).mockResolvedValue(updatedStep);
      vi.mocked(prisma.workflowInstance.update).mockResolvedValue({
        ...createdInstance,
        state: "cancelled",
        closedAt: new Date(),
      });

      await decideStep(mockInstanceId, 1, "rejected", mockUserId, "no");

      expect(workflowEvents.emitWorkflowCancelled).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: mockInstanceId,
          usecaseId: mockUsecaseId,
          byUserId: mockUserId,
          comment: "no",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getWorkflowInstance
  // -------------------------------------------------------------------------

  describe("getWorkflowInstance", () => {
    it("fetches instance with steps ordered by stepIndex", async () => {
      const instance = {
        ...createdInstance,
        currentStep: 1,
        steps: [
          {
            id: "ws-1",
            instanceId: mockInstanceId,
            stepIndex: 0,
            stepName: "Risk Assessment",
            assigneeRole: "risk_officer",
            assigneeUserId: null,
            decidedById: mockUserId,
            decision: "approved",
            comment: "",
            decidedAt: new Date(),
          },
          {
            id: "ws-2",
            instanceId: mockInstanceId,
            stepIndex: 1,
            stepName: "Security Review",
            assigneeRole: "ai_owner",
            assigneeUserId: null,
            decidedById: null,
            decision: "pending",
            comment: "",
            decidedAt: null,
          },
          {
            id: "ws-3",
            instanceId: mockInstanceId,
            stepIndex: 2,
            stepName: "Final Approval",
            assigneeRole: "admin",
            assigneeUserId: null,
            decidedById: null,
            decision: "pending",
            comment: "",
            decidedAt: null,
          },
        ],
      } satisfies WorkflowInstanceWithSteps;

      vi.mocked(prisma.workflowInstance.findUnique).mockResolvedValue(instance);

      const result = await getWorkflowInstance(mockInstanceId);

      expect(prisma.workflowInstance.findUnique).toHaveBeenCalledWith({
        where: { id: mockInstanceId },
        include: { steps: { orderBy: { stepIndex: "asc" } } },
      });
      expect(result).toBeDefined();
      expect(result!.currentStep).toBe(1);
      expect(result!.steps).toHaveLength(3);
    });
  });
});
