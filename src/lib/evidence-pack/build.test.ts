import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  evidence: { findMany: vi.fn().mockResolvedValue([]) },
  usecaseFria: { findFirst: vi.fn().mockResolvedValue(null) },
  auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  usecaseControlStatus: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/db", () => ({ prisma: mockDb }));
vi.mock("@/lib/audit/verify", () => ({
  verifyChain: vi
    .fn()
    .mockResolvedValue({ ok: true, totalChecked: 0, fromSeq: 0, toSeq: 0 }),
}));
vi.mock("@/lib/reports/aggregator", () => ({ aggregate: vi.fn() }));
vi.mock("@/lib/reports/registry", () => ({ getTemplate: vi.fn() }));
vi.mock("@/lib/reports/renderers/pdf", () => ({
  renderPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
}));
vi.mock("@/lib/storage", () => ({
  store: vi
    .fn()
    .mockResolvedValue({ path: "stored/pack.zip", sha256: "abc", bytes: 100 }),
  retrieve: vi.fn().mockResolvedValue(Buffer.from("evidence-bytes")),
}));

beforeEach(() => vi.clearAllMocks());

describe("buildEvidencePack", () => {
  it("builds a zip with cover, evidence, snapshot, verification, and manifest", async () => {
    mockDb.evidence.findMany.mockResolvedValue([
      {
        id: "e1",
        controlId: "c1",
        filename: "doc.pdf",
        filePath: "/evidence/doc.pdf",
        sha256: "hash1",
      },
    ]);
    mockDb.usecaseFria.findFirst.mockResolvedValue({
      id: "f1",
      title: "FRIA v1",
      status: "approved",
      sectionsJson: {},
      version: 1,
      updatedAt: new Date(),
    });
    mockDb.usecaseControlStatus.findMany.mockResolvedValue([
      { controlId: "c1", status: "satisfied" },
    ]);

    const { buildEvidencePack } = await import("./build");
    const result = await buildEvidencePack({
      orgId: "org1",
      usecaseId: "uc1",
      framework: "nist-ai-rmf",
      userId: "u1",
    });

    expect(result.entries).toContain("manifest.json");
    expect(result.entries).toContain("verification.json");
    expect(result.entries).toContain("cover.pdf");
    expect(result.entries).toContain("snapshot.json");
    expect(result.entries.some((e: string) => e.startsWith("evidence/"))).toBe(
      true,
    );

    // The deliverable is a real .zip (PK\x03\x04 local-file-header magic)…
    expect(Buffer.isBuffer(result.zip)).toBe(true);
    expect(result.zip.subarray(0, 2).toString("latin1")).toBe("PK");

    // …and it actually contains every listed file, with the manifest matching.
    const JSZip = (await import("jszip")).default;
    const reopened = await JSZip.loadAsync(result.zip);
    const zipped = Object.keys(reopened.files)
      .filter((k) => !reopened.files[k].dir) // JSZip materializes folder entries (e.g. "evidence/")
      .sort();
    expect(zipped).toEqual([...result.entries].sort());
    const manifestInZip = await reopened.file("manifest.json")!.async("string");
    expect(manifestInZip).toBe(result.manifest);
    const coverInZip = await reopened.file("cover.pdf")!.async("nodebuffer");
    expect(coverInZip.toString()).toBe("cover-pdf-placeholder");
  });

  it("is deterministic — same inputs produce a byte-identical zip", async () => {
    // Pin only Date (not setImmediate/setTimeout, which JSZip's async needs)
    // so snapshot.frozenAt is identical across both builds.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    try {
      const { buildEvidencePack } = await import("./build");
      const a = await buildEvidencePack({
        orgId: "org1",
        usecaseId: "uc1",
        framework: "nist-ai-rmf",
        userId: "u1",
      });
      const b = await buildEvidencePack({
        orgId: "org1",
        usecaseId: "uc1",
        framework: "nist-ai-rmf",
        userId: "u1",
      });
      expect(a.zip.equals(b.zip)).toBe(true);
      expect(a.packHash).toBe(b.packHash);
    } finally {
      vi.useRealTimers();
    }
  });

  it("verification passes for an intact chain", async () => {
    const { verifyChain } = await import("@/lib/audit/verify");
    const { buildEvidencePack } = await import("./build");
    await buildEvidencePack({
      orgId: "org1",
      usecaseId: "uc1",
      framework: "nist-ai-rmf",
      userId: "u1",
    });
    expect(verifyChain).toHaveBeenCalledWith({ orgId: "org1" });
  });

  it("is org-scoped — queries use orgId filter", async () => {
    const { buildEvidencePack } = await import("./build");
    await buildEvidencePack({
      orgId: "org1",
      usecaseId: "uc1",
      framework: "nist-ai-rmf",
      userId: "u1",
    });

    expect(mockDb.evidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: "org1" }),
      }),
    );
  });

  it("produces a manifest with a pack hash", async () => {
    const { buildEvidencePack } = await import("./build");
    const result = await buildEvidencePack({
      orgId: "org1",
      usecaseId: "uc1",
      framework: "nist-ai-rmf",
      userId: "u1",
    });
    expect(result.packHash).toBeTruthy();
    expect(typeof result.packHash).toBe("string");
  });
});
