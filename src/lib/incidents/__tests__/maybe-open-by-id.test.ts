import { describe, it, expect } from "vitest";
import { maybeOpenIncidentByEvaluationId } from "../auto-open";

describe("maybeOpenIncidentByEvaluationId", () => {
  it("returns null for an unknown evaluation id (no throw)", async () => {
    const result = await maybeOpenIncidentByEvaluationId(
      "00000000-0000-0000-0000-000000000000",
      null,
    );
    expect(result).toBeNull();
  });
});
