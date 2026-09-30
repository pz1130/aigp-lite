import { it, expect, vi } from "vitest";
import { processMoonshotRun } from "./processor";
import type { ProcessDeps } from "./processor";

it("runs the engine, persists findings, marks evaluation completed", async () => {
  const db = {
    evaluation: {
      findFirstOrThrow: vi.fn().mockResolvedValue({
        id: "e1",
        orgId: "o1",
        connectionId: "c1",
        model: "gpt-4o",
        promptSourceIds: ["jailbreak"],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    evaluationFinding: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    providerConnection: { findUniqueOrThrow: vi.fn() },
  };
  const runEngine = vi.fn().mockResolvedValue({
    results: [
      {
        prompt_id: "p1",
        prompt: "x",
        response: "I won't.",
        passed: true,
        category: "jailbreak",
        severity: "high",
        duration_ms: 1,
        input_tokens: 1,
        output_tokens: 1,
      },
    ],
  });
  await processMoonshotRun(
    { evaluationId: "e1" },
    {
      db: db as unknown as ProcessDeps["db"],
      runEngine,
    },
  );
  expect(db.evaluationFinding.createMany).toHaveBeenCalled();
  const finalUpdate = db.evaluation.update.mock.calls.at(-1)![0];
  expect(finalUpdate.data.status).toBe("completed");
  expect(finalUpdate.data.passedCount).toBe(1);
});
