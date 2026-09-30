import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  runBenchmark,
  runAudit,
  maybeOpenIncidentByEvaluationId,
  suggestDuplicates,
  forwardAuditLogToSinks,
  deliverToOrg,
  mockFindMany,
  processMoonshotRun,
  processWorkerPing,
  processEvidencePackBuild,
} = vi.hoisted(() => ({
  runBenchmark: vi.fn().mockResolvedValue(undefined),
  runAudit: vi.fn().mockResolvedValue(undefined),
  maybeOpenIncidentByEvaluationId: vi.fn().mockResolvedValue(null),
  suggestDuplicates: vi.fn().mockResolvedValue([]),
  forwardAuditLogToSinks: vi.fn().mockResolvedValue(undefined),
  deliverToOrg: vi.fn().mockResolvedValue(undefined),
  mockFindMany: vi.fn().mockResolvedValue([]),
  processMoonshotRun: vi.fn().mockResolvedValue(undefined),
  processWorkerPing: vi.fn().mockResolvedValue(undefined),
  processEvidencePackBuild: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/drift/runner", () => ({ runBenchmark }));
vi.mock("@/lib/alignment-audit/runner", () => ({ runAudit }));
vi.mock("@/lib/incidents/auto-open", () => ({
  maybeOpenIncidentByEvaluationId,
}));
vi.mock("@/lib/incidents/dedup", () => ({ suggestDuplicates }));
vi.mock("@/lib/audit/log", () => ({ forwardAuditLogToSinks }));
vi.mock("@/lib/integrations/delivery", () => ({ deliverToOrg }));
vi.mock("@/lib/redteam/moonshot/processor", () => ({ processMoonshotRun }));
vi.mock("../processors/worker-ping", () => ({ processWorkerPing }));
vi.mock("../processors/evidence-pack", () => ({ processEvidencePackBuild }));
vi.mock("@/lib/db", () => ({
  prisma: { webhookEndpoint: { findMany: mockFindMany } },
}));

import { runProcessor, JOB_NAMES } from "../processors";

beforeEach(() => vi.clearAllMocks());

describe("jobs/processors", () => {
  it("lists all job names", () => {
    expect(JOB_NAMES.sort()).toEqual(
      [
        "drift.run",
        "alignment-audit.run",
        "incident.maybe-open",
        "incident.suggest-duplicates",
        "audit.forward",
        "mcp.driftSweep",
        "redteam.moonshot.run",
        "webhook.deliver",
        "worker.ping",
        "evidencePack.build",
      ].sort(),
    );
  });

  it("dispatches drift.run to runBenchmark", async () => {
    await runProcessor("drift.run", { runId: "r1" });
    expect(runBenchmark).toHaveBeenCalledWith("r1");
  });

  it("dispatches alignment-audit.run to runAudit", async () => {
    await runProcessor("alignment-audit.run", { auditId: "a1" });
    expect(runAudit).toHaveBeenCalledWith("a1");
  });

  it("dispatches incident.maybe-open", async () => {
    await runProcessor("incident.maybe-open", {
      evaluationId: "e1",
      usecaseId: "u1",
    });
    expect(maybeOpenIncidentByEvaluationId).toHaveBeenCalledWith("e1", "u1");
  });

  it("dispatches incident.suggest-duplicates", async () => {
    await runProcessor("incident.suggest-duplicates", { incidentId: "i1" });
    expect(suggestDuplicates).toHaveBeenCalledWith("i1");
  });

  it("dispatches audit.forward to forwardAuditLogToSinks", async () => {
    await runProcessor("audit.forward", { auditLogId: "abc" });
    expect(forwardAuditLogToSinks).toHaveBeenCalledWith("abc");
  });

  it("audit.forward handles missing auditLogId gracefully", async () => {
    await expect(
      runProcessor("audit.forward", { auditLogId: "nonexistent-id" }),
    ).resolves.toBeUndefined();
  });

  it("dispatches webhook.deliver to deliverToOrg", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "ep1",
        url: "https://example.com/webhook",
        secret: "s1",
        events: ["incident.created"],
        enabled: true,
      },
      {
        id: "ep2",
        url: "https://test.com/hook",
        secret: "s2",
        events: ["incident.created", "incident.resolved"],
        enabled: true,
      },
    ]);
    await runProcessor("webhook.deliver", {
      orgId: "o1",
      event: "incident.created",
      data: { incidentId: "i1" },
    });
    expect(deliverToOrg).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ep1",
          url: "https://example.com/webhook",
        }),
        expect.objectContaining({ id: "ep2", url: "https://test.com/hook" }),
      ]),
      "incident.created",
      "o1",
      { incidentId: "i1" },
    );
  });

  it("webhook.deliver does not throw when no matching endpoints", async () => {
    // deliverToOrg with an empty array is a valid no-op
    await expect(
      runProcessor("webhook.deliver", {
        orgId: "no-such-org",
        event: "unknown.event",
        data: {},
      }),
    ).resolves.toBeUndefined();
  });

  it("dispatches redteam.moonshot.run to processMoonshotRun", async () => {
    await runProcessor("redteam.moonshot.run", { evaluationId: "e1" });
    expect(processMoonshotRun).toHaveBeenCalledWith(
      { evaluationId: "e1" },
      expect.objectContaining({ db: expect.anything() }),
    );
  });

  it("dispatches worker.ping to processWorkerPing", async () => {
    await runProcessor("worker.ping", { nonce: "n1" });
    expect(processWorkerPing).toHaveBeenCalledWith({ nonce: "n1" });
  });
});
