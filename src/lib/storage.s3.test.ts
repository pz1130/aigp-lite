import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = sendMock;
  }
  class MockCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: MockS3Client,
    DeleteObjectCommand: MockCommand,
    GetObjectCommand: MockCommand,
    PutObjectCommand: MockCommand,
  };
});

import { remove, retrieve, store, verify } from "./storage";

describe("S3-compatible evidence storage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sendMock.mockReset();
  });

  it("stores, retrieves, and removes an object through the S3 driver", async () => {
    vi.stubEnv("AIGP_STORAGE_DRIVER", "s3");
    vi.stubEnv("AIGP_S3_BUCKET", "aigp-test");
    vi.stubEnv("AIGP_S3_REGION", "us-east-1");
    sendMock.mockResolvedValueOnce({});

    const stored = await store("org-1", {
      buffer: Buffer.from("s3 content"),
      filename: "evidence.txt",
      mimeType: "text/plain",
    });

    expect(stored.path).toMatch(/^s3:\/\/aigp-test\/evidence\/org-1\/.+\.txt$/);
    expect(sendMock).toHaveBeenCalledTimes(1);

    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from("s3 content") },
    });
    await expect(retrieve(stored.path)).resolves.toEqual(
      Buffer.from("s3 content"),
    );

    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from("s3 content") },
    });
    await expect(
      verify(
        stored.path,
        "2efbd7bc06306eb4b954ba01bc9295f204a107f72e60ce24bb26c7cc8ad18e80",
      ),
    ).resolves.toBe(true);

    sendMock.mockResolvedValueOnce({});
    await remove(stored.path);
    expect(sendMock).toHaveBeenCalledTimes(4);
  });
});
