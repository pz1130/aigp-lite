import { describe, it, expect } from "vitest";
import { isMyApproval, nextActions } from "./next-actions";
import type { DossierSnapshot, ReadinessEvaluation } from "./types";

describe("personal approval tasks", () => {
  const instance = {
    state: "open",
    currentStep: 1,
    steps: [
      {
        stepIndex: 0,
        decision: "approved",
        assigneeUserId: "me",
        assigneeRole: null,
      },
      {
        stepIndex: 1,
        decision: "pending",
        assigneeUserId: "other",
        assigneeRole: "risk_officer",
      },
    ],
  };
  it("only matches the current step and honors write permissions", () => {
    expect(isMyApproval(instance, "me", "ai_owner")).toBe(false);
    expect(isMyApproval(instance, "other", "viewer")).toBe(false);
    expect(isMyApproval(instance, "other", "ai_owner")).toBe(true);
    expect(isMyApproval(instance, "me", "risk_officer")).toBe(true);
    expect(isMyApproval(instance, "me", "admin")).toBe(true);
  });
  it("excludes closed approvals and retains requests for changes", () => {
    expect(
      isMyApproval({ ...instance, state: "completed" }, "me", "admin"),
    ).toBe(false);
    expect(
      isMyApproval(
        {
          ...instance,
          steps: instance.steps.map((s) => ({
            ...s,
            decision: "requested_changes",
          })),
        },
        "me",
        "risk_officer",
      ),
    ).toBe(true);
  });
});

describe("next actions", () => {
  const snapshot = {
    system: { lifecycleStage: "development" },
  } as DossierSnapshot;
  const readiness: ReadinessEvaluation = {
    state: "not_ready",
    blockingFailing: 1,
    advisoryOpen: 1,
    checks: [
      {
        id: "documentation",
        status: "warn",
        severity: "advisory",
        articleRefs: [],
        deepLink: "/inventory/1#documentation",
        metric: {},
      },
      {
        id: "risk_management",
        status: "fail",
        severity: "blocking",
        articleRefs: [],
        deepLink: "/risk/usecases/1",
        metric: {},
      },
      {
        id: "classified",
        status: "pass",
        severity: "blocking",
        articleRefs: [],
        deepLink: "/inventory/1/edit",
        metric: {},
      },
    ],
  };
  it("prioritizes blockers, excludes completed checks, and assigns permissions", () => {
    const actions = nextActions(snapshot, readiness, "ai_owner");
    expect(actions.map((a) => a.id)).toEqual([
      "risk_management",
      "documentation",
    ]);
    expect(actions.map((a) => a.canAct)).toEqual([false, true]);
    expect(
      nextActions(snapshot, readiness, "viewer").every((a) => !a.canAct),
    ).toBe(true);
  });
  it("has no launch preparation tasks for retired use cases", () => {
    expect(
      nextActions(
        {
          ...snapshot,
          system: { ...snapshot.system, lifecycleStage: "deprecated" },
        },
        readiness,
        "admin",
      ),
    ).toEqual([]);
  });
});
