import { describe, it, expect } from "vitest";
import { saveAnswerInput } from "./answer-schema";

describe("saveAnswerInput", () => {
  it("accepts a valid answer", () => {
    const parsed = saveAnswerInput.parse({
      assessmentId: "a1",
      processCode: "1.1.1",
      status: "yes",
      elaboration: "done",
      evidenceRefs: ["ev1", "ev2"],
    });
    expect(parsed.status).toBe("yes");
    expect(parsed.evidenceRefs).toEqual(["ev1", "ev2"]);
  });

  it("defaults evidenceRefs to empty and allows null elaboration", () => {
    const parsed = saveAnswerInput.parse({
      assessmentId: "a1",
      processCode: "2.1.1",
      status: "na",
    });
    expect(parsed.evidenceRefs).toEqual([]);
    expect(parsed.elaboration ?? null).toBeNull();
  });

  it("rejects an invalid status", () => {
    expect(() =>
      saveAnswerInput.parse({
        assessmentId: "a1",
        processCode: "1.1.1",
        status: "maybe",
      }),
    ).toThrow();
  });
});
