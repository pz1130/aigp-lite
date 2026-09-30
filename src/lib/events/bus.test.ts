import { describe, it, expect, beforeEach, vi } from "vitest";
import { UsecaseEventBus, type UsecaseEventPayload } from "./bus";

describe("UsecaseEventBus", () => {
  let bus: UsecaseEventBus;

  beforeEach(() => {
    bus = UsecaseEventBus.instance;
  });

  // --- singleton ---

  it("is a singleton", () => {
    const a = UsecaseEventBus.instance;
    const b = UsecaseEventBus.instance;
    expect(a).toBe(b);
  });

  // --- usecase.created ---

  it("fires usecase.created with correct payload", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-3",
      usecaseId: "uc-7",
      byUserId: "user-new",
    };
    const handler = vi.fn();
    bus.onCreated(handler);
    bus.emitCreated(payload);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(payload);
    bus.offCreated(handler);
  });

  it("offCreated removes the listener", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-1",
      usecaseId: "uc-1",
      byUserId: "user-1",
    };
    const handler = vi.fn();
    bus.onCreated(handler);
    bus.offCreated(handler);
    bus.emitCreated(payload);
    expect(handler).not.toHaveBeenCalled();
  });

  // --- usecase.approved ---

  it("fires usecase.approved with correct payload", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-1",
      usecaseId: "uc-99",
      byUserId: "user-abc",
    };
    const handler = vi.fn();
    bus.onApproved(handler);
    bus.emitApproved(payload);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(payload);
    bus.offApproved(handler);
  });

  // --- usecase.rejected ---

  it("fires usecase.rejected with correct payload", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-2",
      usecaseId: "uc-55",
      byUserId: "user-xyz",
    };
    const handler = vi.fn();
    bus.onRejected(handler);
    bus.emitRejected(payload);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(payload);
    bus.offRejected(handler);
  });

  // --- subscribe / unsubscribe ---

  it("allows multiple listeners to subscribe", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-1",
      usecaseId: "uc-1",
      byUserId: "user-1",
    };
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.onApproved(handlerA);
    bus.onApproved(handlerB);
    bus.emitApproved(payload);
    expect(handlerA).toHaveBeenCalledWith(payload);
    expect(handlerB).toHaveBeenCalledWith(payload);
    bus.offApproved(handlerA);
    bus.offApproved(handlerB);
  });

  it("offApproved removes the listener", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-1",
      usecaseId: "uc-1",
      byUserId: "user-1",
    };
    const handler = vi.fn();
    bus.onApproved(handler);
    bus.offApproved(handler);
    bus.emitApproved(payload);
    expect(handler).not.toHaveBeenCalled();
  });

  it("offRejected removes the listener", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-1",
      usecaseId: "uc-1",
      byUserId: "user-1",
    };
    const handler = vi.fn();
    bus.onRejected(handler);
    bus.offRejected(handler);
    bus.emitRejected(payload);
    expect(handler).not.toHaveBeenCalled();
  });

  // --- no memory leaks on unsubscribe ---

  it("does not retain listener after unsubscribe (approved)", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-leak",
      usecaseId: "uc-leak",
      byUserId: "user-leak",
    };
    const handler = vi.fn();
    bus.onApproved(handler);
    bus.offApproved(handler);
    bus.emitApproved(payload);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not retain listener after unsubscribe (rejected)", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-leak",
      usecaseId: "uc-leak",
      byUserId: "user-leak",
    };
    const handler = vi.fn();
    bus.onRejected(handler);
    bus.offRejected(handler);
    bus.emitRejected(payload);
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribing one listener does not affect others (approved)", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-1",
      usecaseId: "uc-1",
      byUserId: "user-1",
    };
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.onApproved(handlerA);
    bus.onApproved(handlerB);
    bus.offApproved(handlerA);
    bus.emitApproved(payload);
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledWith(payload);
    bus.offApproved(handlerB);
  });

  it("unsubscribing one listener does not affect others (rejected)", () => {
    const payload: UsecaseEventPayload = {
      orgId: "org-1",
      usecaseId: "uc-1",
      byUserId: "user-1",
    };
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.onRejected(handlerA);
    bus.onRejected(handlerB);
    bus.offRejected(handlerA);
    bus.emitRejected(payload);
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledWith(payload);
    bus.offRejected(handlerB);
  });
});
