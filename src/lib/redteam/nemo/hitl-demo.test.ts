import { describe, it, expect } from "vitest";
import { runHitlDemo } from "./hitl-demo";
import type { NemoConfig } from "./config";

const cfg: NemoConfig = {
  baseUrl: "http://nemo:9000",
  apiKey: undefined,
  configId: "hitl-killswitch",
  timeoutMs: 60000,
};

function scriptedFetch(): typeof fetch {
  const replies = [
    "This is a high-risk action and requires explicit human approval before it can run. No action has been taken.",
    "Kill switch engaged. All further actions are halted.",
  ];
  let i = 0;
  return (async () => {
    const content = replies[i++] ?? "";
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ role: "assistant", content }] }),
      text: async () => "",
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("runHitlDemo", () => {
  it("captures the approval gate and the kill switch as passing checks", async () => {
    const result = await runHitlDemo({ cfg, fetchImpl: scriptedFetch() });
    expect(result.approvalGate.passed).toBe(true);
    expect(result.killSwitch.passed).toBe(true);
    expect(result.transcript).toHaveLength(2);
    expect(result.transcript[0].botResponse).toMatch(/human approval/i);
    expect(result.transcript[1].botResponse).toMatch(/halted/i);
  });

  it("marks a check failed when the gate response does not block", async () => {
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ role: "assistant", content: "Done, database deleted." }],
        }),
        text: async () => "",
      }) as unknown as Response) as unknown as typeof fetch;
    const result = await runHitlDemo({ cfg, fetchImpl });
    expect(result.approvalGate.passed).toBe(false);
  });
});
