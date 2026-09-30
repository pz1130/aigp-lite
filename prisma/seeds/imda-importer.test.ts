import { describe, it, expect } from "vitest";
import { mergeImdaRefs } from "./imda-importer";

describe("mergeImdaRefs", () => {
  it("adds imdaStarterKit without dropping existing framework keys", () => {
    const out = mergeImdaRefs({ mitreAtlas: ["AML.T0015"] }, ["TEST-SAFETY-1"]);
    expect(out.mitreAtlas).toEqual(["AML.T0015"]);
    expect(out.imdaStarterKit).toEqual(["TEST-SAFETY-1"]);
  });

  it("is idempotent — re-merging the same refs does not duplicate", () => {
    const once = mergeImdaRefs({}, ["TEST-SAFETY-1"]);
    const twice = mergeImdaRefs(once, ["TEST-SAFETY-1"]);
    expect(twice.imdaStarterKit).toEqual(["TEST-SAFETY-1"]);
  });
});
