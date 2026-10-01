import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

export function _testReset() {
  cachedKey = null;
}

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.AIGP_ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32)
      throw new Error("AIGP_ENCRYPTION_KEY must decode to 32 bytes");
    cachedKey = buf;
    return cachedKey;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AIGP_ENCRYPTION_KEY is required in production");
  }
  const seed = process.env.AIGP_ENCRYPTION_SEED ?? "aigp-dev-default";
  console.warn(
    "[secrets] AIGP_ENCRYPTION_KEY missing; deriving dev key from AIGP_ENCRYPTION_SEED/default. Set AIGP_ENCRYPTION_KEY for stable cross-env data.",
  );
  cachedKey = createHash("sha256").update(seed).digest();
  return cachedKey;
}

export function encryptJsonWithKey(key: Buffer, payload: unknown): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]);
}

export function decryptJsonWithKey<T = unknown>(
  key: Buffer,
  blob: Buffer | Uint8Array,
): T {
  if (blob.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  // Pin the tag length so a truncated tag is rejected, not accepted as shorter.
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function encryptJson(payload: unknown): Buffer {
  return encryptJsonWithKey(loadKey(), payload);
}

export function decryptJson<T = unknown>(blob: Buffer | Uint8Array): T {
  return decryptJsonWithKey<T>(loadKey(), blob);
}
