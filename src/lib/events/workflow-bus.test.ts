import { describe, it, expect, vi } from "vitest";
import { workflowEvents, type UsecaseDeprecatedPayload } from "./workflow-bus";

describe("workflow bus: usecase.deprecated", () => {
  it("delivers the payload to onUsecaseDeprecated handlers", () => {
    const handler = vi.fn();
    workflowEvents.onUsecaseDeprecated(handler);
    const payload: UsecaseDeprecatedPayload = {
      orgId: "o1",
      usecaseId: "u1",
      sunsetDate: "2026-12-31T00:00:00.000Z",
      deprecatedByUserId: "user1",
    };
    workflowEvents.emitUsecaseDeprecated(payload);
    expect(handler).toHaveBeenCalledWith(payload);
  });
});
