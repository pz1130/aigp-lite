import { describe, it, expect } from "vitest";
import { saveAnswerInput, createInput, frtStatus } from "./answer-schema";

describe("frtStatus", () => {
  it("accepts the four states and rejects others", () => {
    for (const s of ["unanswered", "met", "not_met", "na"]) {
      expect(frtStatus.safeParse(s).success).toBe(true);
    }
    expect(frtStatus.safeParse("yes").success).toBe(false);
  });
});

describe("saveAnswerInput", () => {
  it("accepts a well-formed answer and defaults evidenceRefs", () => {
    const r = saveAnswerInput.parse({
      assessmentId: "a1",
      thresholdCode: "FRT-CYBER-T2-1",
      status: "met",
    });
    expect(r.evidenceRefs).toEqual([]);
  });

  it("accepts underscore category codes", () => {
    expect(
      saveAnswerInput.safeParse({
        assessmentId: "a1",
        thresholdCode: "FRT-LOSS_OF_CONTROL-T3-2",
        status: "na",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed threshold code", () => {
    expect(
      saveAnswerInput.safeParse({
        assessmentId: "a1",
        thresholdCode: "ASI01-T1",
        status: "met",
      }).success,
    ).toBe(false);
  });
});

describe("createInput", () => {
  it("requires a title and allows null usecaseId", () => {
    expect(
      createInput.parse({ title: "Q3 review", usecaseId: null }),
    ).toMatchObject({
      title: "Q3 review",
    });
    expect(createInput.safeParse({ title: "" }).success).toBe(false);
  });
});
