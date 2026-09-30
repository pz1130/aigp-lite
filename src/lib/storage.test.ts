import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { store, retrieve, remove, verify } from "./storage";

const STORAGE_ROOT = "./storage/evidence";

interface FileLike {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

function randomOrgId() {
  return crypto.randomBytes(8).toString("hex");
}

function createFakeFile(
  filename: string,
  mimeType: string,
  content: string | Buffer = "test content",
): FileLike {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { buffer, filename, mimeType };
}

describe("evidence storage", () => {
  const orgId = randomOrgId();
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const p of cleanupPaths) {
      try {
        await fs.rm(path.dirname(p), { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    cleanupPaths.length = 0;
  });

  it("stores file with correct org path structure", async () => {
    const file = createFakeFile("test.pdf", "application/pdf", "hello world");
    const result = await store(orgId, file);
    cleanupPaths.push(result.path);

    expect(result.path).toContain(`storage/evidence/${orgId}/`);
    expect(result.path).toMatch(/\.pdf$/);
    expect(result.sha256).toHaveLength(64);
    expect(result.bytes).toBe(file.buffer.byteLength);
  });

  it("computes sha256 hash correctly", async () => {
    const content = "sha256 test content";
    const file = createFakeFile("test.txt", "text/plain", content);
    const result = await store(orgId, file);
    cleanupPaths.push(result.path);

    const expected = crypto.createHash("sha256").update(content).digest("hex");
    expect(result.sha256).toBe(expected);
  });

  it("rejects files over 25MiB", async () => {
    const largeContent = Buffer.alloc(26214401);
    const file = createFakeFile("large.pdf", "application/pdf", largeContent);
    await expect(store(orgId, file)).rejects.toThrow(
      "exceeds maximum allowed size",
    );
  });

  it("rejects invalid mime types", async () => {
    const file = createFakeFile(
      "evil.sh",
      "application/x-shellscript",
      "echo pwned",
    );
    await expect(store(orgId, file)).rejects.toThrow("MIME type not allowed");
  });

  it("retrieves stored file unchanged", async () => {
    const content = "retrieve test content";
    const file = createFakeFile("notes.txt", "text/plain", content);
    const stored = await store(orgId, file);
    cleanupPaths.push(stored.path);

    const retrieved = await retrieve(stored.path);
    expect(retrieved.toString("utf-8")).toBe(content);
  });

  it("verifies sha256 correctly", async () => {
    const content = "verify test content";
    const file = createFakeFile("data.json", "application/json", content);
    const stored = await store(orgId, file);
    cleanupPaths.push(stored.path);

    await expect(verify(stored.path, stored.sha256)).resolves.toBe(true);
    await expect(verify(stored.path, "0".repeat(64))).resolves.toBe(false);
  });

  it("deletes file successfully", async () => {
    const content = "delete test";
    const file = createFakeFile("todelete.pdf", "application/pdf", content);
    const stored = await store(orgId, file);

    await remove(stored.path);

    await expect(retrieve(stored.path)).rejects.toThrow("ENOENT");
  });

  it("throws on missing file during retrieve", async () => {
    await expect(
      retrieve(`${STORAGE_ROOT}/nonexistent/file.pdf`),
    ).rejects.toThrow("ENOENT");
  });

  it("throws on missing file during verify", async () => {
    await expect(
      verify(`${STORAGE_ROOT}/nonexistent/file.pdf`, "00".repeat(32)),
    ).rejects.toThrow("ENOENT");
  });
});
