import { randomBytes } from "node:crypto";

/** Opaque, unguessable per-system public intake token. */
export function generatePublicToken(): string {
  return randomBytes(32).toString("base64url");
}
