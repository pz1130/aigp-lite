import { EventEmitter } from "node:events";

export type McpDriftPayload = {
  orgId: string;
  serverId: string;
  serverName: string;
  snapshotId: string;
  addedCount: number;
  removedCount: number;
  changedCount: number;
};

export class McpEventBus extends EventEmitter {
  private static _instance: McpEventBus;

  private constructor() {
    super();
  }

  static get instance(): McpEventBus {
    if (!McpEventBus._instance) {
      McpEventBus._instance = new McpEventBus();
    }
    return McpEventBus._instance;
  }

  emitDriftDetected(payload: McpDriftPayload): void {
    this.emit("mcp.drift.detected", payload);
  }

  onDriftDetected(handler: (payload: McpDriftPayload) => void): void {
    this.on("mcp.drift.detected", handler);
  }

  offDriftDetected(handler: (payload: McpDriftPayload) => void): void {
    this.off("mcp.drift.detected", handler);
  }
}
