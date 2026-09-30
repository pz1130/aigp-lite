import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { nanoid } from "nanoid";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_STORAGE_ROOT = "./storage/evidence";
const MAX_SIZE = 25 * 1024 * 1024; // 25 MiB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

type FileInput = File | { buffer: Buffer; filename: string; mimeType: string };

type StorageConfig =
  | { driver: "local"; root: string }
  | { driver: "s3"; bucket: string; prefix: string; client: S3Client };

let s3Client: S3Client | null = null;

function getStorageConfig(): StorageConfig {
  const driver =
    process.env.AIGP_STORAGE_DRIVER?.trim().toLowerCase() || "local";
  if (driver === "local") {
    return {
      driver,
      root: process.env.AIGP_STORAGE_ROOT?.trim() || DEFAULT_STORAGE_ROOT,
    };
  }

  if (driver !== "s3") {
    throw new Error(`Unsupported storage driver: ${driver}`);
  }

  const bucket = process.env.AIGP_S3_BUCKET?.trim();
  if (!bucket) throw new Error("AIGP_S3_BUCKET is required for S3 storage");

  if (!s3Client) {
    const accessKeyId = process.env.AIGP_S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AIGP_S3_SECRET_ACCESS_KEY?.trim();
    s3Client = new S3Client({
      region: process.env.AIGP_S3_REGION?.trim() || "us-east-1",
      endpoint: process.env.AIGP_S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: process.env.AIGP_S3_FORCE_PATH_STYLE === "true",
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  return {
    driver,
    bucket,
    prefix: (process.env.AIGP_S3_PREFIX?.trim() || "evidence").replace(
      /^\/+|\/+$/g,
      "",
    ),
    client: s3Client,
  };
}

function localFilePath(root: string, orgId: string, filename: string): string {
  const rootPath = path.resolve(root);
  const filePath = path.resolve(rootPath, orgId, filename);
  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("Invalid storage scope");
  }
  return filePath;
}

function s3Path(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

function parseS3Path(filePath: string): { bucket: string; key: string } {
  const url = new URL(filePath);
  const key = url.pathname.replace(/^\//, "");
  if (url.protocol !== "s3:" || !url.hostname || !key) {
    throw new Error("Invalid S3 storage key");
  }
  return { bucket: url.hostname, key };
}

async function getBuffer(file: FileInput): Promise<Buffer> {
  if ("buffer" in file) {
    return file.buffer;
  }
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function getExt(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/json": ".json",
    "application/zip": ".zip",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
  };
  return map[mimeType] ?? ".bin";
}

/**
 * Store a file and return its evidence path, SHA-256 hash, and byte count.
 */
export async function store(
  orgId: string,
  file: FileInput,
): Promise<{ path: string; sha256: string; bytes: number }> {
  const buffer = await getBuffer(file);
  const mimeType = "mimeType" in file ? file.mimeType : file.type;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`MIME type not allowed: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_SIZE) {
    throw new Error(
      `File size ${buffer.byteLength} exceeds maximum allowed size ${MAX_SIZE}`,
    );
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const uuid = nanoid();
  const ext = getExt(mimeType);
  const filename = `${uuid}${ext}`;
  const config = getStorageConfig();

  if (config.driver === "s3") {
    const key = `${config.prefix}/${orgId}/${filename}`;
    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentLength: buffer.byteLength,
        ContentType: mimeType,
      }),
    );
    return {
      path: s3Path(config.bucket, key),
      sha256,
      bytes: buffer.byteLength,
    };
  }

  const filePath = localFilePath(config.root, orgId, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);

  return { path: filePath, sha256, bytes: buffer.byteLength };
}

/**
 * Retrieve a stored file as a Buffer.
 */
export async function retrieve(filePath: string): Promise<Buffer> {
  if (filePath.startsWith("s3://")) {
    const { bucket, key } = parseS3Path(filePath);
    const config = getStorageConfig();
    if (config.driver !== "s3") {
      throw new Error("S3 storage key requires AIGP_STORAGE_DRIVER=s3");
    }
    if (bucket !== config.bucket) throw new Error("S3 storage bucket mismatch");
    const response = await config.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) throw new Error("S3 object has no body");
    return Buffer.from(await response.Body.transformToByteArray());
  }
  return fs.readFile(filePath);
}

/**
 * Delete a stored file.
 */
export async function remove(filePath: string): Promise<void> {
  if (filePath.startsWith("s3://")) {
    const { bucket, key } = parseS3Path(filePath);
    const config = getStorageConfig();
    if (config.driver !== "s3") {
      throw new Error("S3 storage key requires AIGP_STORAGE_DRIVER=s3");
    }
    if (bucket !== config.bucket) throw new Error("S3 storage bucket mismatch");
    await config.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
    return;
  }
  await fs.unlink(filePath);
}

/**
 * Verify the SHA-256 hash of a stored file matches the expected value.
 */
export async function verify(
  filePath: string,
  expectedSha256: string,
): Promise<boolean> {
  const buffer = await retrieve(filePath);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return sha256 === expectedSha256;
}
