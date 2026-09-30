import { describe, it, expect, vi, beforeEach } from "vitest";

const { add, runProcessor } = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue(undefined),
  runProcessor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../queue", () => ({ getQueue: vi.fn() }));
vi.mock("../processors", () => ({ runProcessor }));

import { enqueueJob } from "../enqueue";
import { getQueue } from "../queue";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("jobs/enqueue", () => {
  it("adds to BullMQ with a deterministic jobId when queue is available", async () => {
    (getQueue as ReturnType<typeof vi.fn>).mockReturnValue({ add });
    await enqueueJob("drift.run", { runId: "r1" });
    expect(add).toHaveBeenCalledWith(
      "drift.run",
      { runId: "r1" },
      expect.objectContaining({ jobId: "drift.run__r1", attempts: 3 }),
    );
    expect(runProcessor).not.toHaveBeenCalled();
  });

  it("derives jobId per job type", async () => {
    (getQueue as ReturnType<typeof vi.fn>).mockReturnValue({ add });
    await enqueueJob("incident.maybe-open", {
      evaluationId: "e1",
      usecaseId: null,
    });
    expect(add).toHaveBeenLastCalledWith(
      "incident.maybe-open",
      { evaluationId: "e1", usecaseId: null },
      expect.objectContaining({ jobId: "incident.maybe-open__e1" }),
    );
  });

  it("derives a deterministic jobId for audit.forward", async () => {
    (getQueue as ReturnType<typeof vi.fn>).mockReturnValue({ add });
    await enqueueJob("audit.forward", { auditLogId: "abc" });
    expect(add).toHaveBeenLastCalledWith(
      "audit.forward",
      { auditLogId: "abc" },
      expect.objectContaining({ jobId: "audit.forward__abc" }),
    );
  });

  it("adds uniqueness suffix to webhook.deliver jobId so distinct events for the same org do not dedupe", async () => {
    (getQueue as ReturnType<typeof vi.fn>).mockReturnValue({ add });
    await enqueueJob("webhook.deliver", {
      orgId: "o1",
      event: "incident.created",
      data: {},
    });
    expect(add).toHaveBeenLastCalledWith(
      "webhook.deliver",
      { orgId: "o1", event: "incident.created", data: {} },
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^webhook\.deliver__o1__incident\.created__/,
        ),
      }),
    );
  });

  it("derives a deterministic jobId for redteam.moonshot.run", async () => {
    (getQueue as ReturnType<typeof vi.fn>).mockReturnValue({ add });
    await enqueueJob("redteam.moonshot.run", { evaluationId: "e1" });
    expect(add).toHaveBeenLastCalledWith(
      "redteam.moonshot.run",
      { evaluationId: "e1" },
      expect.objectContaining({ jobId: "redteam.moonshot.run__e1" }),
    );
  });

  it("never emits a `:` in a custom jobId (BullMQ forbids it)", async () => {
    (getQueue as ReturnType<typeof vi.fn>).mockReturnValue({ add });
    const cases: Array<Parameters<typeof enqueueJob>> = [
      ["drift.run", { runId: "r1" }],
      ["incident.maybe-open", { evaluationId: "e1", usecaseId: null }],
      ["incident.suggest-duplicates", { incidentId: "i1" }],
      ["audit.forward", { auditLogId: "abc" }],
      ["webhook.deliver", { orgId: "o1", event: "incident.created", data: {} }],
      ["redteam.moonshot.run", { evaluationId: "e1" }],
    ];
    for (const [name, payload] of cases) {
      await enqueueJob(name as never, payload as never);
      const jobId = add.mock.lastCall?.[2]?.jobId as string;
      expect(jobId, `${name} jobId`).not.toContain(":");
    }
  });

  it("runs the processor inline (non-blocking) when queue is unavailable", async () => {
    (getQueue as ReturnType<typeof vi.fn>).mockReturnValue(null);
    await enqueueJob("incident.suggest-duplicates", { incidentId: "i1" });
    // flush the void microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(add).not.toHaveBeenCalled();
    expect(runProcessor).toHaveBeenCalledWith("incident.suggest-duplicates", {
      incidentId: "i1",
    });
  });
});
