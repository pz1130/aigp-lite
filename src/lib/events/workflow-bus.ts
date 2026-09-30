import { EventEmitter } from "node:events";

export type StepAssignedPayload = {
  orgId: string;
  instanceId: string;
  stepIndex: number;
  stepName: string;
  assigneeUserId?: string | null;
  assigneeRole?: string | null;
  usecaseId: string;
};

export type WorkflowCancelledPayload = {
  orgId: string;
  instanceId: string;
  usecaseId: string;
  byUserId: string;
  comment?: string;
};

export type GoLiveDecidedPayload = {
  orgId: string;
  usecaseId: string;
  reviewId: string;
  status: "approved" | "live" | "rejected" | "withdrawn";
  decidedByUserId: string;
};

export type IncidentTrendsAlertPayload = {
  orgId: string;
  reportId: string;
  version: number;
  publishedByUserId: string;
  signalCount: number;
};

export type UsecaseDeprecatedPayload = {
  orgId: string;
  usecaseId: string;
  sunsetDate: string | null;
  deprecatedByUserId: string;
};

export type GoLiveStalePayload = {
  orgId: string;
  usecaseId: string;
  reviewId: string;
  triggeredByUserId?: string;
};

export class WorkflowEventBus extends EventEmitter {
  private static _instance: WorkflowEventBus;

  private constructor() {
    super();
  }

  static get instance(): WorkflowEventBus {
    if (!WorkflowEventBus._instance) {
      WorkflowEventBus._instance = new WorkflowEventBus();
    }
    return WorkflowEventBus._instance;
  }

  emitStepAssigned(p: StepAssignedPayload): void {
    this.emit("workflow.step.assigned", p);
  }

  emitWorkflowCancelled(p: WorkflowCancelledPayload): void {
    this.emit("workflow.cancelled", p);
  }

  onStepAssigned(h: (p: StepAssignedPayload) => void): void {
    this.on("workflow.step.assigned", h);
  }

  onWorkflowCancelled(h: (p: WorkflowCancelledPayload) => void): void {
    this.on("workflow.cancelled", h);
  }

  emitGoLiveDecided(p: GoLiveDecidedPayload): void {
    this.emit("go-live.decided", p);
  }

  onGoLiveDecided(h: (p: GoLiveDecidedPayload) => void): void {
    this.on("go-live.decided", h);
  }

  emitIncidentTrendsAlert(p: IncidentTrendsAlertPayload): void {
    this.emit("incident-trends.alert", p);
  }

  onIncidentTrendsAlert(h: (p: IncidentTrendsAlertPayload) => void): void {
    this.on("incident-trends.alert", h);
  }

  emitUsecaseDeprecated(p: UsecaseDeprecatedPayload): void {
    this.emit("usecase.deprecated", p);
  }

  onUsecaseDeprecated(h: (p: UsecaseDeprecatedPayload) => void): void {
    this.on("usecase.deprecated", h);
  }

  emitGoLiveStale(p: GoLiveStalePayload): void {
    this.emit("go-live.stale", p);
  }

  onGoLiveStale(h: (p: GoLiveStalePayload) => void): void {
    this.on("go-live.stale", h);
  }
}

export const workflowEvents = WorkflowEventBus.instance;
