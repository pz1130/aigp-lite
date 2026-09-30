import { describe, it, expect } from "vitest";
import { saveAnswerInput, createInput, checkStatus } from "./answer-schema";

describe("checkStatus", () => {
  it("accepts the four states and rejects others", () => {
    for (const s of ["unanswered", "yes", "no", "na"]) {
      expect(checkStatus.safeParse(s).success).toBe(true);
    }
    expect(checkStatus.safeParse("maybe").success).toBe(false);
  });
});

describe("saveAnswerInput", () => {
  it("accepts a well-formed item code and defaults evidenceRefs", () => {
    const r = saveAnswerInput.safeParse({
      assessmentId: "a1",
      itemCode: "AG1-01",
      status: "yes",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.evidenceRefs).toEqual([]);
  });

  it("rejects a malformed item code", () => {
    expect(
      saveAnswerInput.safeParse({
        assessmentId: "a1",
        itemCode: "ASI01-T1",
        status: "yes",
      }).success,
    ).toBe(false);
    expect(
      saveAnswerInput.safeParse({
        assessmentId: "a1",
        itemCode: "AG1-1",
        status: "yes",
      }).success,
    ).toBe(false);
  });
});

describe("createInput", () => {
  it("requires a title and allows a null usecaseId", () => {
    expect(
      createInput.safeParse({ title: "Q1 agent review", usecaseId: null })
        .success,
    ).toBe(true);
    expect(createInput.safeParse({ title: "" }).success).toBe(false);
  });
});
