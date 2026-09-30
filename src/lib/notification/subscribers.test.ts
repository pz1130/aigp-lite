import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { workflowEvents } from "@/lib/events/workflow-bus";
import "./subscribers"; // side-effect register
import { prisma } from "@/lib/db";

let orgId: string;
let ownerId: string;
let riskUserA: string;
let riskUserB: string;
let usecaseId: string;
let instanceId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `SubT ${Date.now()}` },
  });
  orgId = org.id;
  ownerId = (
    await prisma.user.create({
      data: { email: `own-${Date.now()}@x`, name: "Own", passwordHash: "x" },
    })
  ).id;
  riskUserA = (
    await prisma.user.create({
      data: { email: `ra-${Date.now()}@x`, name: "RA", passwordHash: "x" },
    })
  ).id;
  riskUserB = (
    await prisma.user.create({
      data: { email: `rb-${Date.now()}@x`, name: "RB", passwordHash: "x" },
    })
  ).id;
  await prisma.membership.createMany({
    data: [
      { orgId, userId: ownerId, role: "admin" },
      { orgId, userId: riskUserA, role: "risk_officer" },
      { orgId, userId: riskUserB, role: "risk_officer" },
    ],
  });
  const uc = await prisma.aiUsecase.create({
    data: {
      orgId,
      name: `UC ${Date.now()}`,
      ownerId,
      autonomyLevel: "assistant",
      deploymentType: "built",
    },
  });
  usecaseId = uc.id;
  const inst = await prisma.workflowInstance.create({
    data: {
      orgId,
      usecaseId,
      template: "Promotion",
      currentStep: 0,
      state: "open",
    },
  });
  instanceId = inst.id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { orgId } });
  await prisma.workflowInstance.deleteMany({ where: { orgId } });
  await prisma.aiUsecase.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, riskUserA, riskUserB] } },
  });
  await prisma.organization.delete({ where: { id: orgId } });
});

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { orgId } });
});

async function waitForNotifications(expected: number, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = await prisma.notification.count({ where: { orgId } });
    if (c >= expected) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `Timed out waiting for ${expected} notifications; got ${await prisma.notification.count({ where: { orgId } })}`,
  );
}

describe("notification subscribers", () => {
  it("step.assigned with assigneeRole writes one row per role member", async () => {
    workflowEvents.emitStepAssigned({
      orgId,
      instanceId,
      stepIndex: 0,
      stepName: "Risk Assessment",
      assigneeUserId: null,
      assigneeRole: "risk_officer",
      usecaseId,
    });
    await waitForNotifications(2);
    const rows = await prisma.notification.findMany({ where: { orgId } });
    expect(rows).toHaveLength(2);
    const recips = rows.map((r) => r.recipientUserId).sort();
    expect(recips).toEqual([riskUserA, riskUserB].sort());
    expect(rows[0].type).toBe("step_assigned");
    expect(rows[0].titleKey).toBe("stepAssigned.title");
    expect(rows[0].bodyKey).toBe("stepAssigned.body");
    expect(rows[0].linkHref).toBe(`/workflow/${instanceId}`);
    expect(rows[0].workflowInstanceId).toBe(instanceId);
    expect((rows[0].paramsJson as { stepName: string }).stepName).toBe(
      "Risk Assessment",
    );
  });

  it("step.assigned with assigneeUserId writes single row", async () => {
    workflowEvents.emitStepAssigned({
      orgId,
      instanceId,
      stepIndex: 1,
      stepName: "Final",
      assigneeUserId: ownerId,
      assigneeRole: null,
      usecaseId,
    });
    await waitForNotifications(1);
    const rows = await prisma.notification.findMany({ where: { orgId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(ownerId);
  });

  it("step.assigned with neither writes nothing", async () => {
    workflowEvents.emitStepAssigned({
      orgId,
      instanceId,
      stepIndex: 0,
      stepName: "X",
      assigneeUserId: null,
      assigneeRole: null,
      usecaseId,
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.notification.count({ where: { orgId } })).toBe(0);
  });

  it("workflow.cancelled writes one row to usecase owner", async () => {
    workflowEvents.emitWorkflowCancelled({
      orgId,
      instanceId,
      usecaseId,
      byUserId: riskUserA,
      comment: "no",
    });
    await waitForNotifications(1);
    const rows = await prisma.notification.findMany({ where: { orgId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(ownerId);
    expect(rows[0].type).toBe("workflow_cancelled");
    expect(rows[0].titleKey).toBe("workflowCancelled.title");
  });

  it("email transport failure does not block notification insert", async () => {
    const { emailTransport } = await import("./email");
    const spy = vi
      .spyOn(emailTransport, "send")
      .mockRejectedValue(new Error("boom"));
    workflowEvents.emitStepAssigned({
      orgId,
      instanceId,
      stepIndex: 0,
      stepName: "X",
      assigneeUserId: ownerId,
      assigneeRole: null,
      usecaseId,
    });
    await waitForNotifications(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("go-live.decided notifications", () => {
  it("notifies the owner when the decider is someone else", async () => {
    workflowEvents.emitGoLiveDecided({
      orgId,
      usecaseId,
      reviewId: "rev-1",
      status: "approved",
      decidedByUserId: riskUserA, // not the owner
    });
    await waitForNotifications(1);
    const rows = await prisma.notification.findMany({ where: { orgId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(ownerId);
    expect(rows[0].type).toBe("go_live_decision");
    expect(rows[0].titleKey).toBe("goLiveDecision.approved.title");
    expect(rows[0].bodyKey).toBe("goLiveDecision.approved.body");
    expect(rows[0].linkHref).toBe(`/inventory/${usecaseId}`);
    expect(
      (rows[0].paramsJson as { usecaseName: string }).usecaseName,
    ).toBeTruthy();
  });

  it("uses per-status keys for each decision status", async () => {
    for (const status of ["live", "rejected", "withdrawn"] as const) {
      await prisma.notification.deleteMany({ where: { orgId } });
      workflowEvents.emitGoLiveDecided({
        orgId,
        usecaseId,
        reviewId: `rev-${status}`,
        status,
        decidedByUserId: riskUserA,
      });
      await waitForNotifications(1);
      const rows = await prisma.notification.findMany({ where: { orgId } });
      expect(rows[0].titleKey).toBe(`goLiveDecision.${status}.title`);
      expect(rows[0].bodyKey).toBe(`goLiveDecision.${status}.body`);
    }
  });

  it("suppresses the notification when the owner is the decider", async () => {
    workflowEvents.emitGoLiveDecided({
      orgId,
      usecaseId,
      reviewId: "rev-self",
      status: "approved",
      decidedByUserId: ownerId, // owner === decider
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.notification.count({ where: { orgId } })).toBe(0);
  });

  it("does not throw when the usecase is missing", async () => {
    workflowEvents.emitGoLiveDecided({
      orgId,
      usecaseId: "does-not-exist",
      reviewId: "rev-missing",
      status: "approved",
      decidedByUserId: riskUserA,
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.notification.count({ where: { orgId } })).toBe(0);
  });
});

describe("mcp.drift notifications", () => {
  it("mcp.drift fans out to mcp.write holders", async () => {
    const { McpEventBus } = await import("@/lib/events/mcp-bus");
    const server = await prisma.mcpServer.create({
      data: {
        orgId,
        name: "Drift Server",
        endpoint: "https://mcp.example.com",
        transport: "http",
        createdById: ownerId,
      },
    });
    McpEventBus.instance.emitDriftDetected({
      orgId,
      serverId: server.id,
      serverName: "Drift Server",
      snapshotId: "snap_test",
      addedCount: 1,
      removedCount: 0,
      changedCount: 2,
    });
    await waitForNotifications(3);
    const rows = await prisma.notification.findMany({
      where: { orgId, type: "mcp_drift_alert" },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].titleKey).toBe("mcpDriftAlert.title");
    expect(rows[0].bodyKey).toBe("mcpDriftAlert.body");
    expect(rows[0].linkHref).toBe(`/mcp/${server.id}`);
    await prisma.mcpServer.delete({ where: { id: server.id } });
  });
});

describe("incident-trends.alert notifications", () => {
  it("incident-trends.alert fans out to write-holders, excluding the publisher", async () => {
    // ownerId(admin), riskUserA/riskUserB(risk_officer) all hold incident-trends.write.
    // Publisher is riskUserA -> expect rows for ownerId + riskUserB only.
    workflowEvents.emitIncidentTrendsAlert({
      orgId,
      reportId: "rep_test_1",
      version: 3,
      publishedByUserId: riskUserA,
      signalCount: 2,
    });
    await waitForNotifications(2);
    const rows = await prisma.notification.findMany({ where: { orgId } });
    expect(rows).toHaveLength(2);
    const recips = rows.map((r) => r.recipientUserId).sort();
    expect(recips).toEqual([ownerId, riskUserB].sort());
    expect(recips).not.toContain(riskUserA);
    expect(rows[0].type).toBe("incident_trends_alert");
    expect(rows[0].titleKey).toBe("incidentTrendsAlert.title");
    expect(rows[0].bodyKey).toBe("incidentTrendsAlert.body");
    expect(rows[0].linkHref).toBe("/incident-trends/rep_test_1");
    expect((rows[0].paramsJson as { version: number }).version).toBe(3);
    expect((rows[0].paramsJson as { count: number }).count).toBe(2);
  });
});
