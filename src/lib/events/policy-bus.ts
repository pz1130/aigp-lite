import { EventEmitter } from "node:events";

export type PolicyBlockedPayload = {
  orgId: string;
  policyId: string;
  policyName: string;
  severity: string;
  snippet?: string;
  usecaseId?: string;
  invocationId?: string;
  blocked: boolean;
};

export class PolicyEventBus extends EventEmitter {
  private static _instance: PolicyEventBus;

  private constructor() {
    super();
  }

  static get instance(): PolicyEventBus {
    if (!PolicyEventBus._instance) {
      PolicyEventBus._instance = new PolicyEventBus();
    }
    return PolicyEventBus._instance;
  }

  emitBlocked(payload: PolicyBlockedPayload): void {
    this.emit("policy.blocked", payload);
  }

  onBlocked(handler: (payload: PolicyBlockedPayload) => void): void {
    this.on("policy.blocked", handler);
  }

  offBlocked(handler: (payload: PolicyBlockedPayload) => void): void {
    this.off("policy.blocked", handler);
  }
}

export const policyEvents = PolicyEventBus.instance;
