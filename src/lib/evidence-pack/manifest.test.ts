import { describe, it, expect } from "vitest";
import { buildManifest } from "./manifest";

describe("buildManifest", () => {
  it("produces deterministic ordering regardless of input order", () => {
    const files = [
      { path: "b-evidence.pdf", content: Buffer.from("hello") },
      { path: "a-cover.pdf", content: Buffer.from("world") },
    ];
    const m1 = buildManifest(files);
    const m2 = buildManifest([...files].reverse());
    expect(m1.files.map((f) => f.path)).toEqual(m2.files.map((f) => f.path));
  });

  it("computes correct SHA-256 per file", () => {
    const files = [{ path: "test.txt", content: Buffer.from("abc") }];
    const m = buildManifest(files);
    expect(m.files[0].sha256).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces a stable pack hash for identical inputs", () => {
    const files = [{ path: "test.txt", content: Buffer.from("hello") }];
    const m1 = buildManifest(files);
    const m2 = buildManifest(files);
    expect(m1.packHash).toBe(m2.packHash);
  });

  it("changing any byte changes the pack hash", () => {
    const m1 = buildManifest([
      { path: "test.txt", content: Buffer.from("hello") },
    ]);
    const m2 = buildManifest([
      { path: "test.txt", content: Buffer.from("world") },
    ]);
    expect(m1.packHash).not.toBe(m2.packHash);
  });

  it("pack hash differs from individual file hashes", () => {
    const m = buildManifest([{ path: "a.txt", content: Buffer.from("x") }]);
    expect(m.packHash).not.toBe(m.files[0].sha256);
  });
});
