import { EventEmitter } from "node:events";

export type UsecaseEventPayload = {
  orgId: string;
  usecaseId: string;
  byUserId: string;
};

export class UsecaseEventBus extends EventEmitter {
  private static _instance: UsecaseEventBus;

  private constructor() {
    super();
  }

  static get instance(): UsecaseEventBus {
    if (!UsecaseEventBus._instance) {
      UsecaseEventBus._instance = new UsecaseEventBus();
    }
    return UsecaseEventBus._instance;
  }

  emitCreated(payload: UsecaseEventPayload): void {
    this.emit("usecase.created", payload);
  }

  emitApproved(payload: UsecaseEventPayload): void {
    this.emit("usecase.approved", payload);
  }

  emitRejected(payload: UsecaseEventPayload): void {
    this.emit("usecase.rejected", payload);
  }

  emitUpdated(payload: UsecaseEventPayload): void {
    this.emit("usecase.updated", payload);
  }

  onCreated(handler: (payload: UsecaseEventPayload) => void): void {
    this.on("usecase.created", handler);
  }

  offCreated(handler: (payload: UsecaseEventPayload) => void): void {
    this.off("usecase.created", handler);
  }

  onApproved(handler: (payload: UsecaseEventPayload) => void): void {
    this.on("usecase.approved", handler);
  }

  offApproved(handler: (payload: UsecaseEventPayload) => void): void {
    this.off("usecase.approved", handler);
  }

  onRejected(handler: (payload: UsecaseEventPayload) => void): void {
    this.on("usecase.rejected", handler);
  }

  offRejected(handler: (payload: UsecaseEventPayload) => void): void {
    this.off("usecase.rejected", handler);
  }

  onUpdated(handler: (payload: UsecaseEventPayload) => void): void {
    this.on("usecase.updated", handler);
  }

  offUpdated(handler: (payload: UsecaseEventPayload) => void): void {
    this.off("usecase.updated", handler);
  }
}

export const usecaseEvents = UsecaseEventBus.instance;
