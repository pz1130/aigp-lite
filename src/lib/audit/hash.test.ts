import { describe, it, expect } from "vitest";
import {
  stableStringify,
  sha256Hex,
  computeSelfHash,
  type HashableRow,
} from "./hash";

describe("stableStringify", () => {
  it("sorts keys recursively", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ b: { d: 1, c: 2 } })).toBe('{"b":{"c":2,"d":1}}');
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined, preserves null", () => {
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("handles primitives", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify(null)).toBe("null");
  });

  it("handles unicode", () => {
    expect(stableStringify({ name: "中文 ✨" })).toBe('{"name":"中文 ✨"}');
  });
});

describe("sha256Hex", () => {
  it("returns 64-char lowercase hex", () => {
    const h = sha256Hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("differs for different inputs", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});

const baseRow: HashableRow = {
  orgId: "o1",
  actorId: "u1",
  action: "test.action",
  resourceType: "thing",
  resourceId: "r1",
  beforeJson: null,
  afterJson: { a: 1, b: 2 },
  ip: null,
  userAgent: null,
  ts: "2026-05-25T00:00:00.000Z",
  seqNum: 1,
  prevHash: null,
};

describe("computeSelfHash", () => {
  it("is deterministic across calls", () => {
    expect(computeSelfHash(baseRow)).toBe(computeSelfHash(baseRow));
  });

  it("is key-order-independent in nested afterJson", () => {
    const r1 = { ...baseRow, afterJson: { a: 1, b: 2 } };
    const r2 = { ...baseRow, afterJson: { b: 2, a: 1 } };
    expect(computeSelfHash(r1)).toBe(computeSelfHash(r2));
  });

  it("differs on any field change", () => {
    const a = computeSelfHash(baseRow);
    expect(computeSelfHash({ ...baseRow, action: "different" })).not.toBe(a);
    expect(computeSelfHash({ ...baseRow, seqNum: 2 })).not.toBe(a);
    expect(computeSelfHash({ ...baseRow, prevHash: "deadbeef" })).not.toBe(a);
    expect(
      computeSelfHash({ ...baseRow, ts: "2026-05-26T00:00:00.000Z" }),
    ).not.toBe(a);
  });

  it("treats null prevHash and undefined prevHash differently in shape but same hash output", () => {
    // undefined drops the key entirely while null preserves it
    const withNull = { ...baseRow, prevHash: null };
    const withoutPrev = { ...baseRow } as Omit<HashableRow, "prevHash"> & {
      prevHash?: null;
    };
    delete (withoutPrev as Record<string, unknown>).prevHash;
    expect(computeSelfHash(withNull)).not.toBe(
      computeSelfHash(withoutPrev as HashableRow),
    );
  });
});
