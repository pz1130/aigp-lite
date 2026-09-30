import path from "node:path";

export const ROLES = [
  "admin",
  "ai_owner",
  "risk_officer",
  "auditor",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

const AUTH_DIR = path.resolve(__dirname, "..", ".auth");

export function storageStateFor(role: Role): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

export const DEMO_PASSWORD = "demo1234";

export function emailFor(role: Role): string {
  return `${role}@demo.local`;
}
