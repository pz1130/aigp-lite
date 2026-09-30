import { createHash } from "node:crypto";
import { sha256Hex } from "@/lib/audit/hash";

export interface ManifestFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface Manifest {
  files: ManifestFile[];
  packHash: string;
}

export interface FileInput {
  path: string;
  content: Buffer;
}

export function buildManifest(files: FileInput[]): Manifest {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  const manifestFiles: ManifestFile[] = sorted.map((f) => ({
    path: f.path,
    sha256: createHash("sha256").update(f.content).digest("hex"),
    bytes: f.content.byteLength,
  }));

  const hashInput = manifestFiles
    .map((f) => `${f.path}:${f.sha256}`)
    .join("\n");
  const packHash = sha256Hex(hashInput);

  return { files: manifestFiles, packHash };
}
